// Biometric-protected wallet unlock — mobile counterpart to dehubweb's
// WebAuthn-PRF-based src/lib/wallet-core/biometric-unlock.ts, adapted to what
// a phone actually has: no portable platform authenticator, just Face ID /
// fingerprint / device passcode gating access to something stored locally.
//
// Design: generate a random 32-byte wrap key, store it in SecureStore under
// this device's screen-lock (WHEN_UNLOCKED_THIS_DEVICE_ONLY, same as private
// keys — see wallets.local.ts), and use it as HKDF key material via
// wallet-core/crypto's encryptStringWithKeyMaterial/decryptStringWithKeyMaterial
// (the same v2:hkdf payload format the web client already understands).
//
// IMPORTANT ASYMMETRY WITH PASSWORD PROTECTION: the wrap key never leaves
// this device, so a biometric-protected payload can only ever be opened again
// FROM THIS DEVICE — unlike a password, it is not a cross-device backup. It
// trades that for skipping Argon2id (seconds of pure-JS computation) on this
// phone. Callers must present this trade-off, not just "biometric vs password".
import * as SecureStore from "expo-secure-store";
import * as ExpoCrypto from "expo-crypto";
import {
  getBiometricCapability,
  requireDeviceOwner,
  BiometricRejectedError,
  BiometricUnavailableError,
} from "../biometric-gate";
import { encryptStringWithKeyMaterial, decryptStringWithKeyMaterial, type EncryptedPayload } from "./crypto";
import { createLogger } from "../logger";

const log = createLogger("wallet-core/biometric-unlock");

export { BiometricRejectedError, BiometricUnavailableError };

const WRAP_KEY_PREFIX = "wallet_biometric_wrapkey_"; // + lowercase address

const KEY_ACCESSIBILITY = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Whether this device can present a biometric/passcode prompt at all. */
export async function isBiometricUnlockAvailable(): Promise<boolean> {
  const cap = await getBiometricCapability();
  return cap.usable;
}

/** True if THIS device already holds a biometric wrap key for `address`. */
export async function hasBiometricWrapKey(address: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(WRAP_KEY_PREFIX + address.toLowerCase());
    return !!raw;
  } catch {
    return false;
  }
}

/**
 * Generate a fresh wrap key, store it biometric-gated on this device, and
 * encrypt `secret` under it. Returns the payload to save to Supabase
 * alongside the wallet row (kdf: "hkdf").
 */
export async function enrollBiometricUnlock(
  address: string,
  secret: string,
): Promise<EncryptedPayload> {
  const wrapKey = ExpoCrypto.getRandomBytes(32);
  try {
    await SecureStore.setItemAsync(
      WRAP_KEY_PREFIX + address.toLowerCase(),
      bytesToHex(wrapKey),
      KEY_ACCESSIBILITY,
    );
    const payload = await encryptStringWithKeyMaterial(secret, wrapKey);
    log.info("enroll:ok", { address: `${address.slice(0, 6)}...${address.slice(-4)}` });
    return payload;
  } finally {
    wrapKey.fill(0);
  }
}

/**
 * Unlock an HKDF-wrapped payload using this device's stored wrap key,
 * requiring a fresh device-owner check first. Throws BiometricUnavailableError
 * if this device never enrolled a wrap key for `address` — that condition is
 * checked by the caller via hasBiometricWrapKey before ever offering this UI,
 * so reaching here with no key stored would be a caller bug, not a user error.
 */
export async function unlockWithBiometrics(
  address: string,
  payload: EncryptedPayload,
): Promise<string> {
  const addr = address.toLowerCase();
  const raw = await SecureStore.getItemAsync(WRAP_KEY_PREFIX + addr);
  if (!raw) {
    throw new BiometricUnavailableError("No biometric-protected wallet is stored on this device.");
  }
  await requireDeviceOwner("Unlock your DeHub wallet");
  const wrapKey = hexToBytes(raw);
  try {
    return await decryptStringWithKeyMaterial(payload, wrapKey);
  } finally {
    wrapKey.fill(0);
  }
}
