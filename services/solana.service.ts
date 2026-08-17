/**
 * Solana minting (#41) — derives the user's Solana keypair from their EVM
 * wallet key, signs the backend's partially-signed mint transaction as fee
 * payer, broadcasts it, and confirms with the backend.
 *
 * The keypair is derived on demand rather than stored (see libs/solana-derive.ts):
 * the same DeHub wallet yields the same Solana address on every device, and
 * there is no secret left behind to lose with the handset. Any wallet holding
 * an EVM key has one now — including imported (pasted private key) wallets,
 * which previously got no Solana wallet at all.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { getAuthUser } from "../libs/auth.utils";
import {
  getCachedSolanaAddress,
  getLegacySolanaSecretKeyHex,
  provisionSolanaAddressForWallet,
} from "../libs/identity-wallet";
import { getPrivateKeyForAddress } from "../libs/wallets.local";
import { deriveSolanaKeypair, hexToBytes } from "../libs/solana-derive";
import { getSolanaRpcUrl, SOLANA_MAINNET_CHAIN_ID } from "../config/solana.constants";
import { apiClient } from "../libs/api.client";

export interface SolanaMintStatus {
  chainsConfigured: number[];
  mintingEnabled: boolean;
  message: string;
}

/** GET /solana/status — whether the backend can mint on Solana right now. */
export async function getSolanaMintStatus(): Promise<SolanaMintStatus> {
  const res = await apiClient.get<SolanaMintStatus | { result: SolanaMintStatus }>(
    "/solana/status",
    { isAuthRequired: false },
  );
  const raw = (res as any)?.result ?? res;
  return raw as SolanaMintStatus;
}

let cachedKeypair: Keypair | null = null;

async function getSignedInEvmAddress(): Promise<string | null> {
  const user = await getAuthUser<any>();
  return user?.walletAddress || user?.address || null;
}

/**
 * Derive (and memoise for the session) the Solana keypair for the signed-in
 * wallet.
 *
 * Releasing the EVM key runs the same device-owner check every other signing
 * path runs, and honours the same grace window — so in practice this does not
 * add a prompt to a session that has already signed something.
 */
export async function getSolanaKeypair(): Promise<Keypair> {
  if (cachedKeypair) return cachedKeypair;

  const address = await getSignedInEvmAddress();
  if (!address) {
    throw new Error("Solana wallet unavailable. Sign in to post on Solana.");
  }

  const evmPrivateKey = await getPrivateKeyForAddress(address, {
    purpose: "Sign your Solana transaction",
  });
  if (!evmPrivateKey) {
    throw new Error(
      "Solana wallet unavailable — this device does not hold the key for your wallet.",
    );
  }

  const kp = deriveSolanaKeypair(evmPrivateKey);
  cachedKeypair = kp;

  // Keep the display cache in step, so the wallet screen can show the address
  // without a second owner-verification prompt.
  await provisionSolanaAddressForWallet(address, evmPrivateKey).catch(() => {});

  return kp;
}

/**
 * Base58 Solana address for the current user, or null if unavailable.
 *
 * Reads the cached address first so that merely displaying it — or stamping it
 * on an upload — never triggers an owner-verification prompt. Only the first
 * call on a device (or one made before the cache was written) falls through to
 * deriving it.
 */
export async function getSolanaAddress(): Promise<string | null> {
  if (cachedKeypair) return cachedKeypair.publicKey.toBase58();
  try {
    const address = await getSignedInEvmAddress();
    if (!address) return null;

    const cached = await getCachedSolanaAddress(address);
    if (cached) return cached;

    const kp = await getSolanaKeypair();
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

/** Clear cached keypair (call on logout / chain account change). */
export function clearSolanaKeypairCache(): void {
  cachedKeypair = null;
}

/**
 * Address of the pre-derivation random keypair, if this device still holds one.
 *
 * Nothing signs with it any more, but it may still hold SOL that was deposited
 * to pay mint fees. The wallet screen surfaces it so the funds are at least
 * visible rather than silently abandoned.
 */
export async function getLegacySolanaAddress(): Promise<string | null> {
  try {
    const address = await getSignedInEvmAddress();
    if (!address) return null;
    const hex = await getLegacySolanaSecretKeyHex(address);
    if (!hex) return null;

    const bytes = hexToBytes(hex);
    const kp =
      bytes.length === 64
        ? Keypair.fromSecretKey(bytes)
        : bytes.length === 32
          ? Keypair.fromSeed(bytes)
          : null;
    return kp?.publicKey.toBase58() ?? null;
  } catch {
    return null;
  }
}

/** Current SOL balance of the user's Solana wallet, in SOL. */
export async function getSolanaBalance(
  address: string,
  chainId: number = SOLANA_MAINNET_CHAIN_ID,
): Promise<number> {
  const connection = new Connection(getSolanaRpcUrl(chainId), "confirmed");
  const lamports = await connection.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

/** POST /solana/confirm-mint — persist the on-chain mint to the backend. */
export async function confirmSolanaMint(params: {
  tokenId: number;
  mintAddress: string;
  txSignature: string;
}): Promise<{ success: boolean; tokenId: number; mintAddress: string }> {
  return apiClient.post(
    "/solana/confirm-mint",
    {
      tokenId: Number(params.tokenId),
      mintAddress: params.mintAddress,
      txSignature: params.txSignature,
    },
    { isAuthRequired: true },
  );
}

export interface SolanaMintParams {
  transactionBase64: string;
  mintAddress: string;
  tokenId: number | string;
  chainId?: number;
}

export interface SolanaMintResult {
  signature: string;
  /** Set when the tx landed on-chain but POST /solana/confirm-mint failed. */
  confirmWarning?: string;
}

/**
 * Sign (fee payer) + broadcast a partially-signed Solana mint transaction,
 * then notify the backend.
 */
export async function broadcastSolanaMint(
  params: SolanaMintParams,
): Promise<SolanaMintResult> {
  const chainId = params.chainId ?? SOLANA_MAINNET_CHAIN_ID;
  const keypair = await getSolanaKeypair();
  const rpcUrl = getSolanaRpcUrl(chainId);
  console.log("[Solana] broadcasting via", rpcUrl.replace(/\/v2\/.+$/, "/v2/<redacted>"));
  const connection = new Connection(rpcUrl, "confirmed");

  let tx: Transaction;
  try {
    const raw = Buffer.from(params.transactionBase64, "base64");
    tx = Transaction.from(raw);
  } catch {
    throw new Error("Invalid mint transaction from server. Please try again.");
  }

  // Sponsored mints are fully signed by the backend already (it pays fees +
  // rent as fee payer), so the local keypair isn't always a required signer
  // any more — partialSign throws "unknown signer" if it isn't. Only sign
  // when this wallet's pubkey actually appears in the transaction's signer
  // set (still true for the payment path, which spends the user's own SOL).
  const isRequiredSigner = tx.signatures.some((sig) => sig.publicKey.equals(keypair.publicKey));
  if (isRequiredSigner) {
    try {
      tx.partialSign(keypair);
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Failed to sign Solana transaction",
      );
    }
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    // SendTransactionError.getLogs() fetches the CONFIRMED transaction by
    // signature — useless here because preflight rejected the tx before it
    // ever reached the network, so nothing was ever confirmed to fetch. A
    // fresh simulateTransaction() call is the only way to get the RPC's
    // actual structured reason (blockhash/signature/account error) instead
    // of the empty logs array both attempts produce identically.
    let simErr: unknown;
    let simLogs: string[] | null | undefined;
    try {
      const sim = await connection.simulateTransaction(tx, undefined, undefined);
      simErr = sim.value.err;
      simLogs = sim.value.logs;
    } catch (simulateThrew) {
      simErr = simulateThrew instanceof Error ? simulateThrew.message : String(simulateThrew);
    }
    console.error("[Solana] sendRawTransaction failed", {
      message: err instanceof Error ? err.message : String(err),
      simulateErr: simErr,
      simulateLogs: simLogs,
      // The backend is fee payer on sponsored mints, so this local wallet
      // isn't necessarily who's actually paying — logged for correlation.
      localWallet: keypair.publicKey.toBase58(),
      recentBlockhash: tx.recentBlockhash,
    });

    const simErrStr = JSON.stringify(simErr).toLowerCase();
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (
      lower.includes("insufficient") ||
      simErrStr.includes("insufficient") ||
      // A brand-new fee-payer wallet with zero lamports has no ledger entry
      // at all yet — same "needs SOL" failure, just surfaced as
      // AccountNotFound since there's no account to even check a balance on.
      simErrStr.includes("accountnotfound")
    ) {
      // Minting is backend-sponsored (the signer is fee payer), so this is
      // never the user's own wallet running dry — it's DeHub's funded
      // wallet. Payments (a different flow, solana-payment.service.ts) do
      // still spend the user's own SOL and keep their own message for this.
      throw new Error("Solana minting is temporarily unavailable. Please try again shortly.");
    }
    if (
      lower.includes("blockhash") ||
      lower.includes("expired") ||
      lower.includes("timeout") ||
      simErrStr.includes("blockhashnotfound")
    ) {
      throw new Error("Solana transaction expired. Please try posting again.");
    }
    throw new Error(`Solana broadcast failed: ${msg}`);
  }

  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch (err) {
    console.warn("[Solana] Confirmation polling failed, tx may still land:", err);
  }

  try {
    await confirmSolanaMint({
      tokenId: Number(params.tokenId),
      mintAddress: params.mintAddress,
      txSignature: signature,
    });
  } catch (err) {
    console.error("[Solana] confirm-mint API failed:", err);
    return {
      signature,
      confirmWarning:
        "Posted on-chain but server sync is delayed. Your post may take a few minutes to appear.",
    };
  }

  return { signature };
}
