// Resolves the EVM wallet for a Supabase identity (Google/Email sign-in).
//
// The identity->address map (SecureStore, this device only) is a fast path so
// repeat logins on the SAME device skip the network round-trip. The source of
// truth for "does this identity already have a wallet" is the Supabase
// `user_wallets` table (see wallet-core/store.ts) — the same table the web
// client reads/writes — so an account created on the web (or on a different
// phone) is RECOVERED here instead of a new, unrelated wallet being minted.
// That table lookup, and the password unlock/creation it requires, is what
// makes this genuinely cross-device instead of merely per-device.
import * as SecureStore from "expo-secure-store";
import { deriveSolanaAddress } from "./solana-derive";
import {
  upsertLocalAccount,
  hasPrivateKeyForAddress,
  getPrivateKeyForAddress,
  removeLocalAccount,
} from "./wallets.local";
import { createLogger } from "./logger";
import {
  fetchWalletReliably,
  saveWallet,
  deleteOtherSeedCopies,
  type StoredWallet,
} from "./wallet-core/store";
import { encryptString, getPayloadKdf, type EncryptedPayload } from "./wallet-core/crypto";
import { generateMnemonic12, deriveFromSecret } from "./wallet-core/derive";
import {
  enrollBiometricUnlock,
  forgetBiometricWrapKey,
  hasBiometricWrapKey,
  unlockWithBiometrics,
} from "./wallet-core/biometric-unlock";
import { setupAAProvider } from "./wallet-core/smart-account";
import { getPreferredChainId } from "./auth.utils";
import { ChainId } from "../config/constants";

const log = createLogger("identity-wallet");

const EVM_MAP_KEY = "supabase_identity_wallet_map_v1";
// uid -> address of a wallet whose replacement row has been written but whose
// cleanup did not finish. Read only by retryPendingResetCleanup, which
// re-validates against the live row before acting on it.
const RESET_CLEANUP_KEY = "wallet_reset_cleanup_v2";

/**
 * What a deferred reset cleanup needs to know. Serialised into the map above.
 *
 * v1 stored the abandoned address alone, which was not enough to be safe: the
 * retry could only ask "has the row changed?", and ANY later change satisfied
 * that — so a marker left by one interrupted reset would happily delete a
 * different, live wallet's recovery record months later. The replacement
 * address is what actually answers "did my reset land?".
 */
interface ResetCleanupMarker {
  abandoned: string;
  replacement: string;
  clearOtherSeedCopies: boolean;
  /** Failed cloud-clear attempts so far; bounded so a retry cannot run forever. */
  attempts?: number;
}

function parseResetMarker(raw: string | undefined): ResetCleanupMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.abandoned === "string" &&
      typeof parsed.replacement === "string"
    ) {
      return {
        abandoned: parsed.abandoned.toLowerCase(),
        replacement: parsed.replacement.toLowerCase(),
        clearOtherSeedCopies: parsed.clearOtherSeedCopies !== false,
        attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
      };
    }
  } catch {
    // A v1 marker (a bare address) or anything corrupt. Unreadable means
    // unsafe: this runs fire-and-forget from sign-in, so it must never throw
    // and must never guess.
  }
  return null;
}
// Pre-derivation random keypairs. Read-only now — see getLegacySolanaSecretKeyHex.
const SOLANA_SK_PREFIX = "local_solana_sk_";
// Derived Solana address cache. Public data; stored only to keep the wallet
// screen from prompting for owner verification to display an address.
const SOLANA_ADDR_PREFIX = "local_solana_addr_";

// THIS_DEVICE_ONLY keeps stored wallet material out of iCloud/Keychain sync and
// device backups, matching the accessibility level wallets.local.ts uses for
// EVM keys.
const KEY_ACCESSIBILITY = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

async function readMap(key: string): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMapEntry(key: string, id: string, value: string): Promise<void> {
  try {
    const map = await readMap(key);
    map[id] = value;
    await SecureStore.setItemAsync(key, JSON.stringify(map));
  } catch (e) {
    log.warn("writeMapEntry:error", { key, e });
  }
}

async function deleteMapEntry(key: string, id: string): Promise<void> {
  try {
    const map = await readMap(key);
    if (!(id in map)) return;
    delete map[id];
    await SecureStore.setItemAsync(key, JSON.stringify(map));
  } catch (e) {
    log.warn("deleteMapEntry:error", { key, e });
  }
}

export type EvmWalletResolution =
  // Local device already has the key — either the fast-path map hit, or the
  // Supabase row had no password payload and turned out to match a key we
  // already hold locally (e.g. re-resolving right after a create/unlock).
  | { status: "ready"; address: string; privateKey: string }
  // Supabase already has a wallet for this identity, protected by a
  // password. The caller must prompt for it and call finishWalletUnlock —
  // creating a new wallet here would silently orphan the user's real one.
  | { status: "needs-unlock"; address: string; payload: EncryptedPayload }
  // Supabase has a biometric/passkey-protected wallet (hkdf payload). If this
  // device enrolled the wrap key, one-tap unlock works; otherwise the unlock
  // UI falls back to wallet password.
  | { status: "needs-biometric-unlock"; address: string; payload: EncryptedPayload }
  // Web passkey/biometric wallet: address is in Supabase but encrypted_seed was
  // intentionally omitted (unlocks only in the browser via WebAuthn — not portable
  // to the phone's fingerprint). User must add a password backup on dehub.io.
  | { status: "needs-web-passkey-sync"; address: string }
  // No wallet exists anywhere for this identity yet — genuinely first login.
  // The caller must prompt to set up protection (password or biometric) and
  // call createAndSaveEvmWalletForIdentity.
  | { status: "needs-create-password" }
  // Supabase wallet lookup failed (network/RLS/transient). The caller must NOT
  // treat this as "no wallet" and mint a new one — try the backend session
  // exchange first, then retry or show unlock. Mirrors dehubweb's
  // proceedToWalletPhase catch, which defaults to unlock (not create) on
  // fetch failure so an existing wallet is never overwritten by accident.
  | { status: "wallet-lookup-failed" };

/**
 * Figures out what this Supabase identity's EVM wallet situation is, without
 * ever minting a wallet on the caller's behalf. See EvmWalletResolution for
 * what each outcome means and what the caller must do next.
 */
/**
 * `prefetched` lets a caller that has ALREADY read the cloud row hand it in
 * instead of paying for a second identical round trip. The wallet-lookup
 * retries this function exists to survive are about a row that may not have
 * REPLICATED yet — once a caller has a definite answer in hand, re-asking
 * costs a network round trip and can only return the same thing. Callers must
 * not pass a row read from before a write (create/unlock/forget); those paths
 * still call with no argument so they re-read.
 */
export async function resolveEvmWalletForIdentity(
  supabaseUserId: string,
  prefetched?: { wallet: StoredWallet | null; failed: boolean },
): Promise<EvmWalletResolution> {
  // Authoritative cross-device source FIRST — same order as dehubweb's
  // proceedToWalletPhase → fetchWallet. The local identity→address map is
  // only a fast path when it agrees with this record; checking it before
  // Supabase is what made mobile open a different account than the website
  // for the same Google login (stale wallet created/tested on this phone
  // shadowed the real Supabase-linked one).
  const { wallet: remote, failed: fetchFailed } =
    prefetched ?? (await fetchWalletReliably(supabaseUserId));
  if (fetchFailed) {
    log.warn("resolveEvmWalletForIdentity:fetchWallet:exhausted-retries", {
      supabaseUserId: `${supabaseUserId.slice(0, 8)}...`,
    });
  }

  const map = await readMap(EVM_MAP_KEY);
  const cachedAddress = map[supabaseUserId]?.toLowerCase();

  const tryReady = async (address: string): Promise<EvmWalletResolution | null> => {
    if (!(await hasPrivateKeyForAddress(address))) return null;
    const pk = await getPrivateKeyForAddress(address, {
      purpose: "Sign in to DeHub",
    });
    if (!pk) return null;
    return { status: "ready", address, privateKey: pk };
  };

  if (remote) {
    const remoteAddr = remote.ethAddress?.toLowerCase?.();
    if (!remoteAddr) {
      log.warn("resolveEvmWalletForIdentity:remote-row-missing-address", { supabaseUserId });
      if (fetchFailed) return { status: "wallet-lookup-failed" };
      return { status: "needs-create-password" };
    }
    if (cachedAddress && cachedAddress !== remoteAddr) {
      log.warn("resolveEvmWalletForIdentity:stale-local-map-cleared", {
        cached: `${cachedAddress.slice(0, 6)}...${cachedAddress.slice(-4)}`,
        canonical: `${remoteAddr.slice(0, 6)}...${remoteAddr.slice(-4)}`,
      });
      await deleteMapEntry(EVM_MAP_KEY, supabaseUserId);
    }

    const ready = await tryReady(remoteAddr);
    if (ready) return ready;

    if (remote.payload) {
      const kdf = getPayloadKdf(remote.payload);
      // eslint-disable-next-line no-console
      console.error("[resolveEvmWallet] cloud payload", { kdf, address: `${remoteAddr.slice(0, 6)}...` });
      if (kdf === "hkdf") {
        const hasWrap = await hasBiometricWrapKey(remoteAddr);
        // eslint-disable-next-line no-console
        console.error("[resolveEvmWallet] hkdf wallet", {
          address: `${remoteAddr.slice(0, 6)}...`,
          hasDeviceWrapKey: hasWrap,
        });
        return { status: "needs-biometric-unlock", address: remoteAddr, payload: remote.payload };
      }
      return { status: "needs-unlock", address: remoteAddr, payload: remote.payload };
    }
    // eslint-disable-next-line no-console
    console.error("[resolveEvmWallet] web passkey wallet — no cloud seed row", {
      address: `${remoteAddr.slice(0, 6)}...`,
    });
    return { status: "needs-web-passkey-sync", address: remoteAddr };
  }

  if (fetchFailed) {
    return { status: "wallet-lookup-failed" };
  }

  // No Supabase row — never trust a device-only cache; the backend may still
  // recognize this identity via web3AuthMeta (session exchange handles that).
  if (cachedAddress) {
    log.warn("resolveEvmWalletForIdentity:orphan-local-cache-ignored", {
      cached: `${cachedAddress.slice(0, 6)}...${cachedAddress.slice(-4)}`,
    });
    await deleteMapEntry(EVM_MAP_KEY, supabaseUserId);
  }

  return { status: "needs-create-password" };
}

/** Supabase-stored wallet address when resolution already knows one. */
export function getKnownWalletAddress(resolution: EvmWalletResolution): string | undefined {
  switch (resolution.status) {
    case "ready":
    case "needs-unlock":
    case "needs-biometric-unlock":
    case "needs-web-passkey-sync":
      return resolution.address;
    default:
      return undefined;
  }
}

/**
 * Completes the "needs-unlock" path: the caller has already decrypted the
 * Supabase payload (via wallet-core/crypto's decryptString) and derived the
 * keypair (via wallet-core/derive's deriveFromSecret) using the password the
 * user entered. This just persists the result locally so future logins on
 * this device hit the fast path instead of unlocking again.
 */
export async function finishWalletUnlock(
  supabaseUserId: string,
  address: string,
  privateKey: string,
): Promise<void> {
  await upsertLocalAccount({ address, privateKey });
  await writeMapEntry(EVM_MAP_KEY, supabaseUserId, address.toLowerCase());
}

/**
 * Completes the "needs-biometric-unlock" path: decrypts the Supabase payload
 * using this device's stored wrap key (biometric/passcode-gated), derives
 * the keypair, and persists it locally the same way finishWalletUnlock does.
 */
export async function finishBiometricUnlock(
  supabaseUserId: string,
  address: string,
  payload: EncryptedPayload,
): Promise<{ address: string; privateKey: string }> {
  const secret = await unlockWithBiometrics(address, payload);
  const derived = deriveFromSecret(secret);
  await finishWalletUnlock(supabaseUserId, derived.ethAddress, derived.ethPrivateKey);
  return { address: derived.ethAddress, privateKey: derived.ethPrivateKey };
}

/**
 * Completes the "needs-create-password" path: generates a brand-new
 * mnemonic-derived wallet (matching the web client's derivation, so a future
 * `deriveFromSecret` on either platform agrees), protects it, and saves it to
 * Supabase — so THIS is the wallet that gets recovered elsewhere, not
 * silently orphaned there.
 *
 * `protection: "password"` encrypts with Argon2id under `secret` (a
 * password) — recoverable on ANY device that knows it. `"biometric"`
 * encrypts with this device's wrap key under HKDF — recoverable ONLY from
 * this device (see wallet-core/biometric-unlock.ts), trading that away for
 * skipping the slow Argon2id derivation entirely.
 *
 * `existingSecret` re-protects and re-saves an already-generated wallet
 * instead of minting a new mnemonic — for retrying after a create attempt
 * whose Supabase save succeeded but whose DeHub sign-in failed. Generating
 * fresh on retry would overwrite the just-saved user_wallets row with a
 * different wallet, orphaning the first one (and any backend account link it
 * acquired).
 */
export async function createAndSaveEvmWalletForIdentity(
  supabaseUserId: string,
  protection: { kind: "password"; password: string } | { kind: "biometric" },
  existingSecret?: string,
  /**
   * Marks this as a RESET: the identity already has a wallet whose key nobody
   * can reach, and this row deliberately overwrites it.
   *
   * It stays a single upsert, never a delete followed by a create. During the
   * gap a delete would open, resolveEvmWalletForIdentity sees no row and
   * reports "needs-create-password", and the backend's stale web3AuthMeta link
   * plus a lingering local key is enough to sign the user back into the
   * account they are trying to leave.
   */
  replacing?: { address: string; clearOtherSeedCopies: boolean },
): Promise<{ address: string; privateKey: string; secret: string }> {
  const mnemonic = existingSecret ?? generateMnemonic12();
  const derived = deriveFromSecret(mnemonic);
  const encrypted =
    protection.kind === "password"
      ? await encryptString(derived.secret, protection.password)
      : await enrollBiometricUnlock(derived.ethAddress, derived.secret);

  // Paranoia: never "clean up" the wallet we are about to write. A retry that
  // reuses `existingSecret` can legitimately land on the same address twice.
  const abandoning =
    replacing && replacing.address.toLowerCase() !== derived.ethAddress.toLowerCase()
      ? replacing
      : undefined;

  if (abandoning) {
    // Written BEFORE the upsert so a crash in between is recoverable. It
    // names the replacement as well as the wallet being left, which is what
    // lets retryPendingResetCleanup tell "my reset landed" from "the row
    // changed for some other reason" — a marker left by a FAILED upsert, or
    // one that outlived its reset, is then discarded rather than acted on.
    const marker: ResetCleanupMarker = {
      abandoned: abandoning.address.toLowerCase(),
      replacement: derived.ethAddress.toLowerCase(),
      clearOtherSeedCopies: abandoning.clearOtherSeedCopies,
    };
    await writeMapEntry(RESET_CLEANUP_KEY, supabaseUserId, JSON.stringify(marker));
  }

  await saveWallet(supabaseUserId, derived.ethAddress, encrypted);

  if (abandoning) {
    // Only now. Until the upsert landed, the old wallet was still this
    // identity's wallet and these were the user's routes back to it.
    await runResetCleanup(supabaseUserId, {
      abandoned: abandoning.address.toLowerCase(),
      replacement: derived.ethAddress.toLowerCase(),
      clearOtherSeedCopies: abandoning.clearOtherSeedCopies,
      attempts: 0,
    });
  }

  await upsertLocalAccount({ address: derived.ethAddress, privateKey: derived.ethPrivateKey });
  await writeMapEntry(EVM_MAP_KEY, supabaseUserId, derived.ethAddress.toLowerCase());
  log.info("createAndSaveEvmWalletForIdentity:created", {
    address: `${derived.ethAddress.slice(0, 6)}...${derived.ethAddress.slice(-4)}`,
    protection: protection.kind,
    reusedSecret: !!existingSecret,
    replaced: abandoning
      ? `${abandoning.address.slice(0, 6)}...${abandoning.address.slice(-4)}`
      : null,
  });
  return { address: derived.ethAddress, privateKey: derived.ethPrivateKey, secret: derived.secret };
}

/**
 * Local traces of a wallet this identity has just ABANDONED.
 *
 * This is housekeeping, not protection, and on the device that performed the
 * reset it is very nearly a no-op. Reaching the reset at all requires that
 * tryReady found no private key and hasBiometricWrapKey was false, so both
 * deletes below have nothing to delete. What is actually left behind is a
 * keyless row in the Import Wallet list (tapping it just reports "No private
 * key stored for this account") and a stale Solana address cache — clutter
 * naming a wallet the user has abandoned, rather than a way back into it.
 * Worth clearing; not worth blocking anything for.
 *
 * `local_solana_sk_<address>` is deliberately left in place — see
 * getLegacySolanaSecretKeyHex. On pre-derivation builds it is the only copy of
 * a Solana key nothing can re-derive, and any balance it holds is still the
 * user's regardless of which EVM wallet DeHub now points at.
 */
export async function forgetAbandonedWalletLocally(address: string): Promise<void> {
  const addr = address.toLowerCase();
  try {
    await removeLocalAccount(addr);
  } catch (e) {
    log.warn("forgetAbandonedWalletLocally:removeLocalAccount", e);
  }
  await forgetBiometricWrapKey(addr);
  try {
    await SecureStore.deleteItemAsync(SOLANA_ADDR_PREFIX + addr);
  } catch (e) {
    log.warn("forgetAbandonedWalletLocally:solana-addr-cache", e);
  }
  log.info("forgetAbandonedWalletLocally:done", {
    address: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
  });
}

/**
 * The two halves of a reset's cleanup, run independently and in the order that
 * cannot strand the other.
 *
 * Local first: it is offline, cannot fail in a way the cloud cares about, and
 * running it second meant one Supabase error left the abandoned wallet listed
 * in Import Wallet forever, even though the two failures have nothing to do
 * with each other.
 *
 * The marker survives only for the part that actually failed, and only for a
 * bounded number of attempts — an identity whose DELETE policy is missing
 * would otherwise re-run two failing deletes on every sign-in for the life of
 * the install. Giving up fails SAFE: the user keeps a route back into the old
 * wallet that the reset panel said would close, which is the harmless
 * direction, but it does mean that copy can end up overstating what happened.
 */
const RESET_CLEANUP_MAX_ATTEMPTS = 5;

async function runResetCleanup(
  supabaseUserId: string,
  marker: ResetCleanupMarker,
): Promise<void> {
  // Local sweep first. forgetAbandonedWalletLocally swallows its own errors,
  // so once the replacement row is live this always happens.
  //
  // Skipped only if this device has since acquired the abandoned wallet's key:
  // the reset panel tells the user to go and export it from the handset that
  // set the wallet up, so a key that is here now is one they deliberately
  // brought back, and a leftover marker must not delete it.
  if (!(await hasPrivateKeyForAddress(marker.abandoned))) {
    await forgetAbandonedWalletLocally(marker.abandoned);
  } else {
    log.info("resetCleanup:kept-reimported-key");
  }

  if (marker.clearOtherSeedCopies) {
    try {
      await deleteOtherSeedCopies(supabaseUserId);
    } catch (e) {
      const attempts = (marker.attempts ?? 0) + 1;
      if (attempts < RESET_CLEANUP_MAX_ATTEMPTS) {
        log.warn("resetCleanup:other-seed-copies-deferred", { attempts, e });
        await writeMapEntry(
          RESET_CLEANUP_KEY,
          supabaseUserId,
          JSON.stringify({ ...marker, attempts })
        );
        return;
      }
      log.error("resetCleanup:giving-up-on-other-seed-copies", {
        attempts,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await deleteMapEntry(RESET_CLEANUP_KEY, supabaseUserId);
}

/**
 * Finish a reset whose cleanup was interrupted (app killed, or the sibling-row
 * deletes failed). Safe to call on every successful sign-in: without a marker
 * it does nothing.
 *
 * The live-row re-read is the whole safety property. The marker is written
 * BEFORE the replacement upsert, so one also exists when that upsert FAILED —
 * and in that case it names the wallet that is still live. Acting on it would
 * delete a working wallet's recovery record. So: only clean up once the row
 * names a DIFFERENT wallet, i.e. the replacement demonstrably landed.
 */
export async function retryPendingResetCleanup(supabaseUserId: string): Promise<void> {
  const map = await readMap(RESET_CLEANUP_KEY);
  const marker = parseResetMarker(map[supabaseUserId]);
  if (!marker) {
    // Unparseable (a v1 marker, or corrupt). Drop it rather than act on a
    // guess — the cost is an unfinished cleanup, which is cosmetic; the cost
    // of guessing is deleting a live wallet's last backup.
    if (map[supabaseUserId]) {
      await deleteMapEntry(RESET_CLEANUP_KEY, supabaseUserId);
      log.warn("retryPendingResetCleanup:discarded-unreadable-marker");
    }
    return;
  }

  const { wallet, failed } = await fetchWalletReliably(supabaseUserId);
  if (failed) return; // unknown — leave the marker, retry on a later sign-in
  const current = wallet?.ethAddress?.toLowerCase();
  if (!current) return; // no row at all — never guess

  if (current !== marker.replacement) {
    // Either the upsert never landed (row is still the abandoned wallet), or
    // the wallet has moved on again since. In both cases the rows this would
    // delete belong to whatever wallet is live NOW, not to the one this
    // marker was about. Discard without deleting anything.
    await deleteMapEntry(RESET_CLEANUP_KEY, supabaseUserId);
    log.info("retryPendingResetCleanup:discarded-marker-row-moved-on", {
      current: `${current.slice(0, 6)}...${current.slice(-4)}`,
    });
    return;
  }

  try {
    await runResetCleanup(supabaseUserId, marker);
    log.info("retryPendingResetCleanup:ran");
  } catch (e) {
    log.warn("retryPendingResetCleanup:failed-will-retry", e);
  }
}

/**
 * Drop THIS DEVICE's cached identity->address mapping for a Supabase
 * identity, without touching Supabase's user_wallets row (the actual
 * canonical record) or the locally-stored key itself (still recoverable via
 * Export Private Key if needed later — it just stops being auto-selected).
 *
 * Fixes the case where this fast path (see resolveEvmWalletForIdentity)
 * cached the WRONG address for this identity — e.g. a wallet created/tested
 * on this phone before it was ever linked to Supabase, which then
 * permanently shadowed the real, Supabase-linked account on every later
 * Google/email login, since the fast path is checked BEFORE Supabase and
 * never re-validates against it. Dropping the entry forces the next
 * resolveEvmWalletForIdentity call to fall through to fetchWallet(userId) —
 * the same cross-device source of truth the web client always reads —
 * instead of trusting this device's possibly-stale local memory.
 */
export async function forgetLocalWalletForIdentity(supabaseUserId: string): Promise<void> {
  await deleteMapEntry(EVM_MAP_KEY, supabaseUserId);
  log.info("forgetLocalWalletForIdentity:cleared", { supabaseUserId: `${supabaseUserId.slice(0, 8)}...` });
}

/**
 * Replace the active wallet for a Supabase identity with a DIFFERENT one —
 * e.g. this identity ended up linked to more than one DeHub account (Supabase
 * links Google/Email logins that share a verified email into ONE identity, so
 * only one wallet's Supabase user_wallets row can be canonical at a time; see
 * dehubweb's AuthProvider.switchActiveWallet, which this mirrors). `secret`
 * may be a BIP-39 mnemonic or a raw hex private key (deriveFromSecret accepts
 * both) — typically the private key of the OTHER account, exported from
 * whichever device/platform is currently signed into it.
 *
 * Overwrites the Supabase user_wallets row (the cross-device source of truth
 * fetchWallet/resolveEvmWalletForIdentity reads) AND this device's local
 * fast-path cache, so both THIS device and any future login (mobile or web)
 * resolve to the new address going forward. The previous wallet's row is
 * gone once this completes — callers must have the user export/back up its
 * key first if they still want it.
 */
export async function switchActiveWalletForIdentity(
  supabaseUserId: string,
  secret: string,
  password: string,
  /**
   * When the caller already knows which wallet this is supposed to be — the
   * recovery path, where the row names an address the user is trying to get
   * back INTO — the write is refused unless the secret derives to it. Without
   * this, one mistyped-but-valid recovery phrase silently replaces the row and
   * drops the user into a different, empty DeHub account, with the original
   * row (and the account behind it) gone.
   *
   * Both the raw EOA and the Safe smart-account address count as a match,
   * since rows written before/after AA resolution hold different ones.
   */
  expectedAddress?: string,
): Promise<{ address: string; privateKey: string }> {
  const derived = deriveFromSecret(secret);

  // Many DeHub accounts (especially pre-migration Web3Auth-era ones, and any
  // AA-enabled account created via the normal write path -- see
  // wallet-core/smart-account.ts / services/auth/localProviderAdapter.ts)
  // are registered under their Safe SMART-ACCOUNT address, not the raw EOA
  // address `deriveFromSecret` returns. Using the raw EOA address here made
  // switching to (or recovering) such an account land on a brand-new,
  // unrelated account instead -- the backend simply had no record of that
  // EOA address. setupAAProvider deterministically recomputes the same Safe
  // address the account was originally created with (never throws --
  // returns null for unsupported chains/Pimlico outages, in which case we
  // fall back to the raw EOA address exactly as before).
  let canonicalAddress = derived.ethAddress;
  try {
    const chainId = (await getPreferredChainId()) ?? ChainId.BASE_MAINNET;
    const aaProvider = await setupAAProvider(derived.ethAddress, derived.ethPrivateKey, chainId);
    if (aaProvider) {
      const accounts = (await aaProvider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.[0]) canonicalAddress = accounts[0];
    }
  } catch (e) {
    log.warn("switchActiveWalletForIdentity:aa-resolve-failed", e);
  }

  // Which address the row ends up carrying. Recomputing the Safe is right when
  // ADOPTING a wallet (the legacy path — the account may well be registered
  // under its Safe). It is wrong when RECOVERING one, because the row already
  // says which address this account is, and rewriting it to the other one
  // breaks the very password backup this call is creating:
  // handleWalletUnlock compares deriveFromSecret(seed).ethAddress — always the
  // EOA — against the row's address and refuses to sign in when they differ.
  // Flip an EOA-addressed row to its Safe and no password can ever open it
  // again. So when the caller named an expected address, write that one back.
  let addressToSave = canonicalAddress;
  if (expectedAddress) {
    const want = expectedAddress.toLowerCase();
    if (want === derived.ethAddress.toLowerCase()) {
      // Keep the derived form rather than `expectedAddress` itself: the latter
      // arrives lowercased from resolveEvmWalletForIdentity, and the row
      // should hold a checksummed address.
      addressToSave = derived.ethAddress;
    } else if (want === canonicalAddress.toLowerCase()) {
      addressToSave = canonicalAddress;
    } else {
      log.error("switchActiveWalletForIdentity:expected-address-mismatch", {
        expected: `${expectedAddress.slice(0, 6)}...${expectedAddress.slice(-4)}`,
        derived: `${derived.ethAddress.slice(0, 6)}...${derived.ethAddress.slice(-4)}`,
      });
      throw new Error(
        `That recovery phrase or private key belongs to a different wallet (${derived.ethAddress.slice(0, 6)}…${derived.ethAddress.slice(-4)}), not this account's (${expectedAddress.slice(0, 6)}…${expectedAddress.slice(-4)}). Nothing was changed.`
      );
    }
  }

  const encrypted = await encryptString(derived.secret, password);
  await saveWallet(supabaseUserId, addressToSave, encrypted);
  await upsertLocalAccount({ address: addressToSave, privateKey: derived.ethPrivateKey });
  await writeMapEntry(EVM_MAP_KEY, supabaseUserId, addressToSave.toLowerCase());
  log.info("switchActiveWalletForIdentity:switched", {
    address: `${addressToSave.slice(0, 6)}...${addressToSave.slice(-4)}`,
    isSmartAccount: addressToSave.toLowerCase() !== derived.ethAddress.toLowerCase(),
    pinnedToExpected: !!expectedAddress,
  });
  return { address: addressToSave, privateKey: derived.ethPrivateKey };
}

/**
 * Record the Solana address derived from this wallet's EVM private key.
 *
 * Only the ADDRESS is cached, and only so the wallet screen can show it
 * without asking the device owner to authenticate for a public value. The
 * secret is never written anywhere: it is recomputed from the EVM key at
 * signing time (see services/solana.service.ts), which is what makes it
 * survive a reinstall or a new handset.
 */
export async function provisionSolanaAddressForWallet(
  evmAddress: string,
  evmPrivateKey: string,
): Promise<string> {
  const address = deriveSolanaAddress(evmPrivateKey);
  try {
    await SecureStore.setItemAsync(
      SOLANA_ADDR_PREFIX + evmAddress.toLowerCase(),
      address,
      KEY_ACCESSIBILITY,
    );
  } catch (e) {
    // Losing the cache costs one extra owner-verification prompt the next time
    // the address is needed, nothing more — the address is re-derivable.
    log.warn("provisionSolanaAddressForWallet:cache:error", e);
  }
  return address;
}

/** Cached Solana address for an EVM wallet, or null if it hasn't been derived yet. */
export async function getCachedSolanaAddress(evmAddress: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SOLANA_ADDR_PREFIX + evmAddress.toLowerCase());
  } catch {
    return null;
  }
}

/**
 * Hex secret key of the pre-derivation, randomly generated Solana wallet, if
 * this device still holds one.
 *
 * Builds before the switch to deterministic derivation minted a random keypair
 * per device. Those keys are not reproducible from anything, so they are left
 * in place rather than overwritten — the wallet screen surfaces the address
 * when it still holds a balance so the funds can be moved out. Nothing signs
 * with it any more.
 */
export async function getLegacySolanaSecretKeyHex(evmAddress: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SOLANA_SK_PREFIX + evmAddress.toLowerCase());
  } catch {
    return null;
  }
}
