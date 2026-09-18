/**
 * Safe Smart Account (ERC-4337) via Pimlico
 * ==========================================
 * Wraps the locally-derived EOA private key (see derive.ts / wallets.local.ts) in a
 * Safe smart account so writes (posts, tips, mints, PPV unlocks, ...) are gasless --
 * mirroring the web app's src/lib/smart-wallet.ts exactly, including the package choice:
 * @web3auth/ethereum-provider + @web3auth/account-abstraction-provider used as pure
 * local libraries. Nothing here talks to Web3Auth's hosted auth backend -- the EOA key
 * comes entirely from the self-custody wallet, same as everywhere else in this app.
 *
 * Chain/Pimlico config comes from the same Supabase edge function ("get-pimlico-config")
 * the web app already calls -- same project, same secret, no new backend work.
 */
import { CHAIN_NAMESPACES, IProvider } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { AccountAbstractionProvider, SafeSmartAccount } from "@web3auth/account-abstraction-provider";
import { supabase } from "../../services/supabase";
import { createLogger } from "../logger";

const log = createLogger("SmartAccount");

const BASE_CHAIN_ID = 8453;
const BNB_CHAIN_ID = 56;

interface AAChainInfo {
  chainId: string; // hex
  rpcTarget: string;
  displayName: string;
  blockExplorerUrl: string;
  ticker: string;
  tickerName: string;
}

// Only chains DeHub actually deploys to get a Safe/Pimlico setup. Any other chainId
// (Ethereum mainnet, old testnets, ...) falls through to the plain EOA path -- same
// coverage as web (CHAIN_CONFIGS in src/lib/contracts/dhb-token.ts).
const AA_CHAIN_CONFIGS: Record<number, AAChainInfo> = {
  [BASE_CHAIN_ID]: {
    chainId: "0x2105",
    // Same endpoints web uses (src/lib/smart-wallet.ts). These were the public
    // mainnet.base.org / binance.nodereal.io RPCs, which rate-limit hard enough
    // that Safe address resolution below can fail on a cold start -- and that
    // failure is silent, because it just drops the caller onto the plain EOA.
    rpcTarget: "https://base-rpc.publicnode.com",
    displayName: "Base",
    blockExplorerUrl: "https://basescan.org",
    ticker: "ETH",
    tickerName: "Ethereum",
  },
  [BNB_CHAIN_ID]: {
    chainId: "0x38",
    rpcTarget: "https://bsc-dataseed.binance.org",
    displayName: "BNB Chain",
    blockExplorerUrl: "https://bscscan.com",
    ticker: "BNB",
    tickerName: "BNB",
  },
};

/** Why a gasless setup attempt for a chain ended the way it did. */
export type AAFailureReason =
  | "unsupported-chain"
  | "config-unavailable"
  | "address-unresolved"
  | "setup-failed";

export type AASetupOutcome =
  | { ok: true; safeAddress: string }
  | { ok: false; reason: AAFailureReason; detail?: string };

// setupAAProvider deliberately never throws -- a Pimlico outage falls back to a
// plain EOA rather than blocking the write. The cost of that is the failure
// leaving no trace: the post then reverts for gas and nothing anywhere says why.
// Recording the last outcome per chain is what lets pre-flight checks and
// support tell "gasless is off" apart from "the user is out of ETH".
const aaOutcomes = new Map<number, AASetupOutcome>();

function recordAAOutcome(chainId: number, outcome: AASetupOutcome): AASetupOutcome {
  aaOutcomes.set(chainId, outcome);
  return outcome;
}

/** Last gasless setup result for a chain, or null if it was never attempted. */
export function getAASetupOutcome(chainId: number): AASetupOutcome | null {
  return aaOutcomes.get(chainId) ?? null;
}

/**
 * True only when a gasless setup for this chain was attempted AND failed.
 * Deliberately false for "never attempted" -- callers use this to block a write,
 * and an unattempted chain is not evidence of anything.
 */
export function hasAASetupFailed(chainId: number): boolean {
  const outcome = aaOutcomes.get(chainId);
  return outcome != null && outcome.ok === false;
}

let cachedPimlicoConfig: { bundlerUrl: string; paymasterUrl: string } | null = null;
let pendingPimlicoFetch: Promise<{ bundlerUrl: string; paymasterUrl: string }> | null = null;

async function getPimlicoConfig(): Promise<{ bundlerUrl: string; paymasterUrl: string }> {
  if (cachedPimlicoConfig) return cachedPimlicoConfig;
  if (pendingPimlicoFetch) return pendingPimlicoFetch;

  pendingPimlicoFetch = (async () => {
    const { data, error } = await supabase.functions.invoke("get-pimlico-config");
    if (error || !data?.bundlerUrl || !data?.paymasterUrl) {
      throw new Error(error?.message || "Pimlico config not configured");
    }
    const config = { bundlerUrl: data.bundlerUrl as string, paymasterUrl: data.paymasterUrl as string };
    cachedPimlicoConfig = config;
    return config;
  })();

  try {
    return await pendingPimlicoFetch;
  } finally {
    pendingPimlicoFetch = null;
  }
}

/** Pimlico v2 URLs are keyed by chain id in the path: /v2/{chainId}/rpc?apikey=... */
function derivePimlicoUrlForChain(baseUrl: string, targetChainId: number): string {
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("Pimlico URL not configured");
  }
  return baseUrl.replace(/\/\d+\/rpc/, `/${targetChainId}/rpc`);
}

/**
 * True when this chain has a Safe/Pimlico setup at all, i.e. a local wallet writing
 * here can be gasless. Used by pre-flight UI checks that used to assume every local
 * wallet needs an ETH balance -- that assumption predates this file and is only still
 * true on chains without an AA_CHAIN_CONFIGS entry.
 */
export function isChainAASupported(chainId: number): boolean {
  return !!AA_CHAIN_CONFIGS[chainId];
}

/**
 * True when this address is a Safe resolved during this session rather than a
 * plain EOA — i.e. the signed-in identity only exists on AA-configured chains.
 *
 * False for "not seen yet", so a caller filtering a chain list keeps offering
 * everything until a Safe has actually been built. That is the safe direction:
 * an over-generous list is caught by switchChain, which refuses and rolls back
 * rather than signing the user in as a different wallet.
 */
export function isSmartAccountIdentity(address?: string | null): boolean {
  if (!address) return false;
  const wanted = address.toLowerCase();
  for (const outcome of aaOutcomes.values()) {
    if (outcome.ok && outcome.safeAddress.toLowerCase() === wanted) return true;
  }
  return false;
}

export interface AAProviderLike {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  chainConfig?: any;
  /**
   * The bundler and account sitting underneath the EIP-1193 surface.
   *
   * Carried through so callers can send SEVERAL calls as one user operation.
   * request() cannot express that: eth_sendTransaction takes a single
   * transaction and the SDK wraps it in a one-entry `calls` array. Batching is
   * what lets a mint fee ride along with the mint itself, in one signature.
   *
   * Absent on the plain-EOA fallback, so every caller needs a path without it.
   */
  bundlerClient?: any;
  smartAccount?: any;
}

/**
 * Answer eth_accounts/eth_requestAccounts instantly from a memoized address instead
 * of round-tripping through the AA SDK on every call. useProviderLifecycle polls
 * eth_accounts on a health-check interval and treats an empty/slow response as "the
 * provider is broken", tearing it down and rebuilding -- which cascaded into
 * "Provider is missing" for unrelated callers (e.g. the upload queue) whenever a
 * live Safe-address lookup hiccuped. Every other method still passes through live.
 */
function wrapWithStableAccounts(provider: AccountAbstractionProvider, address: string): AAProviderLike {
  const normalized = address.toLowerCase();
  const raw = provider as unknown as AAProviderLike;
  return {
    request: async ({ method, params }: { method: string; params?: any[] }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [normalized];
      }
      return raw.request({ method, params });
    },
    on: raw.on?.bind(raw),
    removeListener: raw.removeListener?.bind(raw),
    chainConfig: raw.chainConfig,
    // Public getters on the SDK provider — see AAProviderLike.
    bundlerClient: (provider as any).bundlerClient,
    smartAccount: (provider as any).smartAccount,
  };
}

// One AA provider per (address, chain) -- same key can be reused by any caller
// within this app session; wiped on logout/lock via clearAAProviders().
const storedAAProviders = new Map<string, AAProviderLike>();

function cacheKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}:${chainId}`;
}

/**
 * Build (or reuse) a Safe smart-account provider for the given EOA key + chain.
 * Never throws -- returns null on any failure (unsupported chain, Pimlico config
 * unavailable, provider construction error) so callers can fall back to the plain
 * EOA path exactly as before. That fallback is what keeps a Pimlico outage from
 * ever blocking a post.
 */
export async function setupAAProvider(
  address: string,
  privateKeyHex: string,
  chainId: number,
): Promise<AAProviderLike | null> {
  const key = cacheKey(address, chainId);
  const cached = storedAAProviders.get(key);
  if (cached) return cached;

  const chainInfo = AA_CHAIN_CONFIGS[chainId];
  if (!chainInfo) {
    recordAAOutcome(chainId, { ok: false, reason: "unsupported-chain" });
    return null;
  }

  let pimlicoConfig: { bundlerUrl: string; paymasterUrl: string };
  try {
    pimlicoConfig = await getPimlicoConfig();
  } catch (e) {
    // log.error, not warn: the logger drops warn/info entirely unless DEBUG is
    // set, so on a release build this was the one line that would have named
    // the cause and it never printed.
    log.error("Pimlico config unavailable -- falling back to plain EOA", e);
    recordAAOutcome(chainId, {
      ok: false,
      reason: "config-unavailable",
      detail: (e as Error)?.message,
    });
    return null;
  }

  try {
    const bundlerUrl = derivePimlicoUrlForChain(pimlicoConfig.bundlerUrl, chainId);
    const paymasterUrl = derivePimlicoUrlForChain(pimlicoConfig.paymasterUrl, chainId);

    const chainConfig = {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: chainInfo.chainId,
      rpcTarget: chainInfo.rpcTarget,
      displayName: chainInfo.displayName,
      blockExplorerUrl: chainInfo.blockExplorerUrl,
      ticker: chainInfo.ticker,
      tickerName: chainInfo.tickerName,
    };

    const normalizedPk = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
    const eoaProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });
    await eoaProvider.setupProvider(normalizedPk);

    const aaProvider = await AccountAbstractionProvider.getProviderInstance({
      eoaProvider: eoaProvider as unknown as IProvider,
      smartAccountInit: new SafeSmartAccount(),
      chainConfig,
      bundlerConfig: { url: bundlerUrl },
      paymasterConfig: { url: paymasterUrl },
    });

    // Resolve the Safe address once up front so eth_accounts is a memoized read
    // from here on (see wrapWithStableAccounts).
    let safeAddress: string | null = null;
    let addressError: unknown;
    try {
      const accounts = (await aaProvider.request({ method: "eth_accounts" })) as string[];
      safeAddress = accounts?.[0] || null;
    } catch (e) {
      addressError = e;
    }
    if (!safeAddress) {
      // Without a resolved address we can't safely memoize eth_accounts -- treat
      // this the same as any other AA setup failure and fall back to plain EOA.
      log.error("Could not resolve Safe address -- falling back to plain EOA", addressError);
      recordAAOutcome(chainId, {
        ok: false,
        reason: "address-unresolved",
        detail: (addressError as Error)?.message,
      });
      return null;
    }

    const wrapped = wrapWithStableAccounts(aaProvider, safeAddress);
    storedAAProviders.set(key, wrapped);
    recordAAOutcome(chainId, { ok: true, safeAddress });
    log.info("AA provider ready", { chainId, safeAddress });
    return wrapped;
  } catch (e) {
    log.error("AA provider setup failed -- falling back to plain EOA", e);
    recordAAOutcome(chainId, {
      ok: false,
      reason: "setup-failed",
      detail: (e as Error)?.message,
    });
    return null;
  }
}

/** Called on logout/lock so a stale Safe provider from a previous session is never reused. */
export function clearAAProviders(): void {
  storedAAProviders.clear();
  cachedPimlicoConfig = null;
  // Outcomes describe the session that just ended -- keeping them would let a
  // previous user's failure block the next one's post.
  aaOutcomes.clear();
}
