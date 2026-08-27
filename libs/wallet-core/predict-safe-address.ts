/**
 * Predict the Safe smart-account address for an owner EOA — no private key, no
 * unlock, no signature, no user interaction.
 *
 * Direct port of dehubweb's `src/lib/smart-account-address.ts`. The two must
 * stay identical: they answer the same question about the same accounts, and a
 * divergence would mean one client accepting a session the other rejects.
 *
 * Why it is needed here. The DeHub backend links whatever address a user last
 * SIGNED with; for the built-in wallet that is the Safe smart account, because
 * the AA provider does the signing. `user_wallets` stores the owner EOA the
 * seed derives to. Two different strings for the same person — so comparing
 * the Supabase exchange's linked address against the stored EOA rejects every
 * healthy smart-account session, which is what kept mobile from completing a
 * login without first opening the wallet.
 *
 * A Safe's address is a pure CREATE2 function of (proxy factory, singleton,
 * initializer, saltNonce), and the initializer commits only to owner
 * ADDRESSES — never to a key — so the address is derivable from the EOA alone.
 *
 * The parameters below MUST stay identical to the ones that actually create
 * the account (libs/wallet-core/smart-account.ts builds `new SafeSmartAccount()`
 * with no options, so every default applies):
 *
 *   entryPoint  { address: entryPoint07Address, version: "0.7" }   (its default)
 *   version     "1.4.1"                                            (its default)
 *   owners      [ the single EOA ]  -> threshold defaults to 1
 *   saltNonce   not passed          -> defaults to 0n
 *
 * `viem` and `permissionless` are imported without appearing in package.json's
 * dependencies. Both are already in the installed tree —
 * @web3auth/account-abstraction-provider pulls permissionless in, and the root
 * `overrides` block pins it to 0.2.57 so every copy is the same one this
 * predicts with. Declaring them would mean regenerating package-lock, which
 * invalidates CI's node_modules cache for a tree that already contains them.
 * If either ever stops being reachable, tsc says so before anything ships.
 */
import { createLogger } from "../logger";

const log = createLogger("predict-safe-address");

/** The same endpoint smart-account.ts hands the AA provider for Base. */
const BASE_RPC_URL = "https://base-rpc.publicnode.com";

/**
 * This sits between a tapped "sign in" and the app appearing, so it gets a
 * hard ceiling rather than viem's default. Timing out costs the user nothing
 * they were not already paying: the fallback is the unlock sheet, which is
 * exactly what they would have got without this check at all.
 */
const RPC_TIMEOUT_MS = 4000;

const EOA_RE = /^0x[0-9a-f]{40}$/;

/** owner EOA (lowercased) -> predicted Safe address (lowercased). */
const predictionCache = new Map<string, string>();

/**
 * The Safe smart account `ownerEoa` controls on Base, lowercased.
 *
 * Returns null rather than throwing for every failure — a malformed address,
 * an RPC outage, a library change, a module that will not load under Metro.
 * Callers must treat null as "cannot prove it", never as "not the same
 * wallet": failing closed here drops the user onto the unlock sheet, which is
 * where they were already headed.
 */
export async function predictSafeAddress(
  ownerEoa: string | null | undefined,
): Promise<string | null> {
  const owner = (ownerEoa ?? "").trim().toLowerCase();
  if (!EOA_RE.test(owner)) return null;

  const cached = predictionCache.get(owner);
  if (cached) return cached;

  try {
    // Dynamic so a resolution or Metro-interop problem surfaces as a null
    // prediction on one login rather than a module-load crash at boot.
    const { createClient, http } = await import("viem");
    const { base } = await import("viem/chains");
    const { entryPoint07Address } = await import("viem/account-abstraction");
    const { toSafeSmartAccount } = await import("permissionless/accounts");

    // createClient, not createPublicClient: the extended public actions make
    // the argument type collapse to `never` against toSafeSmartAccount's
    // `client` parameter, and tsc is the only gate CI runs.
    const client = createClient({
      chain: base,
      transport: http(BASE_RPC_URL, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }),
    });

    const account = await toSafeSmartAccount({
      client,
      // A bare { address, type: 'json-rpc' } satisfies viem's JsonRpcAccount,
      // which is a valid owner. Address prediction never signs, so the missing
      // signing methods are never reached.
      owners: [{ address: owner as `0x${string}`, type: "json-rpc" }],
      entryPoint: { address: entryPoint07Address, version: "0.7" },
      version: "1.4.1",
    });

    const predicted = (await account.getAddress()).toLowerCase();
    predictionCache.set(owner, predicted);
    return predicted;
  } catch (e) {
    log.warn("predict:failed", e);
    return null;
  }
}
