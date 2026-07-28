// Device-owner verification for wallet key access.
//
// The private keys in SecureStore are the only thing standing between a person
// holding this phone and the funds in the wallet. SecureStore alone gates on
// "screen is unlocked", which is not the same as "the wallet's owner asked for
// this" — anything running in the app can read a key while the phone sits
// unlocked on a table. This module supplies the missing check: an explicit
// Face ID / fingerprint / device-PIN prompt tied to a stated purpose.
//
// Deliberately app-level rather than keychain-level. expo-secure-store can bind
// items to biometrics via `requireAuthentication`, which is stronger — the OS
// refuses to hand over the bytes at all — but the item must be READ with the
// same flag it was WRITTEN with, and on Android re-enrolling a fingerprint can
// invalidate the underlying keystore entry. Flipping that on keys that already
// exist on people's phones risks locking them out of their own funds, which is
// worse than the hole being closed here. See `hardenStoredKey` in
// wallets.local.ts for the opt-in upgrade path.
import * as LocalAuthentication from "expo-local-authentication";
import { createLogger } from "./logger";

const log = createLogger("biometric-gate");

/** No biometric hardware, or nothing enrolled, or no device passcode set. */
export class BiometricUnavailableError extends Error {
  constructor(message = "This device has no screen lock or biometrics set up.") {
    super(message);
    this.name = "BiometricUnavailableError";
  }
}

/** The prompt appeared and the user dismissed it, or verification failed. */
export class BiometricRejectedError extends Error {
  constructor(message = "Verification was cancelled.") {
    super(message);
    this.name = "BiometricRejectedError";
  }
}

export interface BiometricCapability {
  /** Hardware exists AND something is enrolled AND a passcode/pattern is set. */
  usable: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  /** True when the only factor available is the device PIN/pattern, not a biometric. */
  passcodeOnly: boolean;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    // SECRET (PIN/pattern/password) still proves device ownership, so it counts
    // as usable — it is what iOS falls back to when Face ID fails twice.
    const usable =
      isEnrolled || level === LocalAuthentication.SecurityLevel.SECRET;
    return {
      usable: hasHardware ? usable : level === LocalAuthentication.SecurityLevel.SECRET,
      hasHardware,
      isEnrolled,
      passcodeOnly: level === LocalAuthentication.SecurityLevel.SECRET && !isEnrolled,
    };
  } catch (e) {
    log.warn("capability:error", e);
    return { usable: false, hasHardware: false, isEnrolled: false, passcodeOnly: false };
  }
}

/**
 * Require the device owner to prove presence before a secret is released.
 *
 * Resolves only on a successful verification. Throws BiometricUnavailableError
 * if the device cannot verify at all, or BiometricRejectedError if the user
 * cancelled or failed. Never resolves falsily — a caller that forgets to check
 * a boolean would otherwise leak the key, so failure is always a throw.
 *
 * @param purpose Shown in the system prompt. Say what the key is for, e.g.
 *                "Unlock your DeHub wallet" — a vague prompt trains people to
 *                approve reflexively.
 */
export async function requireDeviceOwner(purpose: string): Promise<void> {
  const capability = await getBiometricCapability();
  if (!capability.usable) {
    log.warn("authenticate:unavailable", capability);
    throw new BiometricUnavailableError();
  }

  let result: LocalAuthentication.LocalAuthenticationResult;
  try {
    result = await LocalAuthentication.authenticateAsync({
      promptMessage: purpose,
      // Let iOS fall through to the passcode sheet rather than dead-ending
      // someone whose face/finger will not read.
      disableDeviceFallback: false,
      cancelLabel: "Cancel",
      requireConfirmation: false,
    });
  } catch (e) {
    // A throw here is the platform refusing to present the prompt at all.
    log.warn("authenticate:error", e);
    throw new BiometricUnavailableError("Couldn't start device verification.");
  }

  if (!result.success) {
    log.info("authenticate:rejected", { error: (result as { error?: string }).error });
    throw new BiometricRejectedError();
  }
  log.info("authenticate:ok");
}
