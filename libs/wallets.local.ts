import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { requireDeviceOwner, type VerificationOutcome } from "./biometric-gate";
import { createLogger } from "./logger";

const log = createLogger("wallets.local");

export interface LocalAccount {
  address: string;
  username?: string;
  createdAt: number;
}

export interface LocalAccountDetails extends LocalAccount {
  privateKey?: string | null;
}

const STORAGE_KEY = "@local_wallet_accounts_v1";
const PK_PREFIX = "local_wallet_pk_"; // per-address key in SecureStore

// WHEN_UNLOCKED_THIS_DEVICE_ONLY rather than WHEN_UNLOCKED: the `THIS_DEVICE_ONLY`
// suffix keeps raw private keys out of iCloud Keychain sync and out of encrypted
// device backups, so a wallet cannot silently follow someone onto a second
// device or be lifted from a backup. Applied to new writes; pre-existing items
// stay readable and are upgraded in place by `hardenStoredKey`.
const KEY_ACCESSIBILITY = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

// Releasing a key requires a fresh device-owner check, but the signer is built
// once per session and would otherwise re-prompt on every provider rebuild.
// A short grace window keeps that to a single prompt without leaving the door
// open: it is memory-only (cleared on app restart) and never persisted.
const UNLOCK_GRACE_MS = 5 * 60 * 1000;
let lastVerifiedAt = 0;

async function verifyOwner(purpose: string, forcePrompt: boolean): Promise<VerificationOutcome> {
  if (!forcePrompt && Date.now() - lastVerifiedAt < UNLOCK_GRACE_MS) {
    log.debug("verifyOwner:grace-window");
    return "verified";
  }
  const outcome = await requireDeviceOwner(purpose);
  // Only a real verification opens the grace window. Recording a timestamp for
  // an unenforceable release would be recording proof that never happened —
  // and would then suppress the prompt on a device that later GAINS a screen
  // lock partway through a session.
  if (outcome === "verified") lastVerifiedAt = Date.now();
  return outcome;
}

/** Drop the grace window — call on sign-out or when the app backgrounds. */
export function forgetDeviceVerification(): void {
  lastVerifiedAt = 0;
}

async function readAll(): Promise<LocalAccount[]> {
  try {
    log.debug("readAll:start");
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed as LocalAccount[];
    log.debug("readAll:success", { count: list.length });
    return list;
  } catch {
    log.warn("readAll:error");
    return [];
  }
}

async function writeAll(list: LocalAccount[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    log.debug("writeAll:success", { count: list.length });
  } catch (e) {
    log.warn("writeAll:error", e);
    throw e;
  }
}

export async function listLocalAccounts(): Promise<LocalAccount[]> {
  return await readAll();
}

export async function upsertLocalAccount(acc: {
  address: string;
  username?: string;
  privateKey?: string | null;
}): Promise<LocalAccount[]> {
  const address = acc.address?.toLowerCase();
  log.info("upsert:start", { address, hasUsername: !!acc.username, hasPk: !!acc.privateKey });
  if (!address) return await readAll();
  const list = await readAll();
  const idx = list.findIndex((a) => a.address.toLowerCase() === address);
  const now = Date.now();
  const next: LocalAccount = {
    address,
    username: acc.username?.trim() || undefined,
    createdAt: idx >= 0 ? list[idx].createdAt : now,
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.unshift(next);
  await writeAll(list);
  // Store private key securely if provided
  if (acc.privateKey) {
    try {
      const pkNorm = acc.privateKey.startsWith("0x") ? acc.privateKey : `0x${acc.privateKey}`;
      log.debug("secure:set:start", { address });
      // Align accessibility with setPrivateKeyForAddress for consistency
      await SecureStore.setItemAsync(PK_PREFIX + address, pkNorm, KEY_ACCESSIBILITY);
      // Verify write succeeded (some platforms may silently fail)
      try {
        const roundtrip = await SecureStore.getItemAsync(PK_PREFIX + address);
        if (!roundtrip) {
          log.warn("secure:set:verify:failed", { address });
        }
        else log.debug("secure:set:verify:ok", { address });
      } catch (verErr) {
        log.warn("secure:set:verify:error", verErr);
      }
    } catch (e) {
      log.warn("secure:set:error", e);
      // ignore secure store failures silently
    }
  }
  log.info("upsert:done", { address });
  return list;
}

export async function removeLocalAccount(address: string): Promise<LocalAccount[]> {
  const addr = address?.toLowerCase();
  log.info("remove:start", { address: addr });
  const list = await readAll();
  const next = list.filter((a) => a.address.toLowerCase() !== addr);
  await writeAll(next);
  // Remove private key from secure storage
  try {
    await SecureStore.deleteItemAsync(PK_PREFIX + addr);
    log.debug("secure:delete:ok", { address: addr });
  } catch {
    log.warn("secure:delete:error", { address: addr });
    // ignore
  }
  log.info("remove:done", { address: addr });
  return next;
}

export async function clearLocalAccounts(): Promise<void> {
  log.info("clearAll:start");
  await writeAll([]);
  log.info("clearAll:done");
}

/**
 * Whether a key exists for this address, WITHOUT releasing it.
 *
 * Existence is not sensitive — the address is already public — so this needs no
 * verification. Use it for UI decisions ("show the export button") so those
 * checks never trigger a biometric prompt.
 */
export async function hasPrivateKeyForAddress(address: string): Promise<boolean> {
  if (!address) return false;
  try {
    const pk = await SecureStore.getItemAsync(PK_PREFIX + address.toLowerCase());
    return !!pk;
  } catch (error) {
    log.warn("secure:has:error", { address, error });
    return false;
  }
}

export interface KeyAccessOptions {
  /**
   * Shown in the system prompt. Describe the action the key is for, so the
   * person can tell an expected prompt from an unexpected one.
   */
  purpose: string;
  /**
   * Always prompt, ignoring the grace window. Use for anything that reveals
   * the key to the user or exports it off-device; reusing a prompt from five
   * minutes ago is not consent to display a secret.
   */
  forcePrompt?: boolean;
  /**
   * Called when the key was released WITHOUT the device owner being verified,
   * because the device has no biometrics and no passcode to check against.
   *
   * Pass this wherever there is a user to talk to, and use it to nudge them to
   * set a screen lock — that is the only thing that actually protects the key on
   * such a device. Callers with no UI (e.g. building the signer at startup) can
   * omit it; the condition is logged either way.
   */
  onUnverified?: () => void;
}

/**
 * Release the private key for `address`, after verifying the device owner where
 * the device is capable of it.
 *
 * Throws BiometricRejectedError when the owner declined the prompt, and
 * BiometricUnavailableError when a capable device could not present one. It
 * never converts a failed check into `null`, because a caller treating "no key"
 * and "not allowed" the same way is how a gate gets bypassed by accident.
 *
 * On a device with NO biometrics and NO passcode there is nothing to verify
 * against, and the key is released with `options.onUnverified` invoked instead
 * of throwing — see requireDeviceOwner for why blocking there would cost access
 * without buying protection.
 */
export async function getPrivateKeyForAddress(
  address: string,
  options: KeyAccessOptions,
): Promise<string | null> {
  if (!address) return null;
  const addr = address.toLowerCase();

  // Verify first: a prompt for a key that does not exist is confusing, so check
  // existence up front, but do so without releasing anything.
  if (!(await hasPrivateKeyForAddress(addr))) {
    log.debug("secure:get:absent", { address: addr });
    return null;
  }

  const outcome = await verifyOwner(options.purpose, options.forcePrompt === true);
  if (outcome === "unenforceable") {
    log.warn("secure:get:released-unverified — device has no screen lock", { address: addr });
    try {
      options.onUnverified?.();
    } catch (e) {
      // A failing nudge must never block the key release it is advising about.
      log.warn("secure:get:onUnverified:threw", e);
    }
  }

  try {
    log.debug("secure:get:start", { address: addr });
    const pk = await SecureStore.getItemAsync(PK_PREFIX + addr);
    log.debug("secure:get:done", { address: addr, found: !!pk });
    return pk || null;
  } catch (error) {
    log.warn("secure:get:error", { address, error });
    return null;
  }
}

/**
 * Re-write an existing key with the current hardened accessibility.
 *
 * Keys stored by older builds used WHEN_UNLOCKED, which permits Keychain sync
 * and backup capture. Reading and rewriting them upgrades that in place. Gated,
 * because it necessarily handles plaintext. Safe to call repeatedly.
 */
export async function hardenStoredKey(address: string): Promise<boolean> {
  const addr = address?.toLowerCase();
  if (!addr) return false;
  const pk = await getPrivateKeyForAddress(addr, {
    purpose: "Secure your DeHub wallet key on this device",
  });
  if (!pk) return false;
  try {
    await SecureStore.setItemAsync(PK_PREFIX + addr, pk, KEY_ACCESSIBILITY);
    log.info("secure:harden:ok", { address: addr });
    return true;
  } catch (e) {
    log.warn("secure:harden:error", { address: addr, error: e });
    return false;
  }
}

export async function setPrivateKeyForAddress(address: string, privateKey: string): Promise<void> {
  const addr = address?.toLowerCase();
  if (!addr || !privateKey) return;
  try {
    const pkNorm = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    log.debug("secure:set:direct:start", { address: addr });
    await SecureStore.setItemAsync(PK_PREFIX + addr, pkNorm, KEY_ACCESSIBILITY);
    // Verify write
    try {
      const roundtrip = await SecureStore.getItemAsync(PK_PREFIX + addr);
      if (!roundtrip) log.warn("secure:set:direct:verify:failed", { address: addr });
      else log.debug("secure:set:direct:verify:ok", { address: addr });
    } catch (verErr) {
      log.warn("secure:set:direct:verify:error", verErr);
    }
  } catch {
    log.warn("secure:set:direct:error", { address: addr });
    // ignore
  }
}

export async function getLocalAccount(address: string): Promise<LocalAccount | null> {
  const list = await readAll();
  const addr = address?.toLowerCase();
  const found = list.find((a) => a.address.toLowerCase() === addr);
  log.debug("getLocalAccount", { address: addr, found: !!found });
  return found || null;
}

export async function getLocalAccountDetails(
  address: string,
  options: KeyAccessOptions = { purpose: "Unlock your DeHub wallet" },
): Promise<LocalAccountDetails | null> {
  log.debug("getLocalAccountDetails:start", { address: address?.toLowerCase?.() });
  const meta = await getLocalAccount(address);
  if (!meta) return null;
  const privateKey = await getPrivateKeyForAddress(address, options);
  const details = { ...meta, privateKey } as LocalAccountDetails;
  // Never log `meta` wholesale here — it is adjacent to key material and this
  // line runs on every provider build.
  log.debug("getLocalAccountDetails:done", { address: meta.address, hasPk: !!privateKey });
  return details;
}

export default {
  listLocalAccounts,
  upsertLocalAccount,
  removeLocalAccount,
  clearLocalAccounts,
  getPrivateKeyForAddress,
  hasPrivateKeyForAddress,
  setPrivateKeyForAddress,
  getLocalAccount,
  getLocalAccountDetails,
  hardenStoredKey,
  forgetDeviceVerification,
};
