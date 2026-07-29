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
 * Whether a key release was actually gated on proof of device ownership.
 *
 * `unenforceable` means the device has no biometrics AND no passcode, so there
 * is nothing to check against — see requireDeviceOwner for why that permits the
 * release rather than blocking it.
 */
export type VerificationOutcome = "verified" | "unenforceable";

/**
 * Require the device owner to prove presence before a secret is released.
 *
 * Returns "verified" when the owner proved presence. Throws
 * BiometricRejectedError when the prompt appeared and was cancelled or failed,
 * and BiometricUnavailableError when the platform claimed it could verify but
 * then could not present the prompt. Both remain hard failures: a caller must
 * never receive a key because a check was dodged or mysteriously did not run.
 *
 * Returns "unenforceable" — without throwing — in exactly one case: the device
 * has no biometrics enrolled and no passcode set, so no check is possible.
 *
 * WHY THAT CASE IS PERMITTED. Blocking it would mean someone with no screen lock
 * cannot tip, post or transact at all, having been able to a version earlier.
 * And it would buy nothing: with no screen lock, "the device is unlocked" is
 * always true, so the key those users hold was already readable to anyone
 * holding the phone before this gate existed. Refusing here costs real access to
 * prevent no exposure that is not already present. The honest response is to get
 * them to set a screen lock, which is what the `onUnverified` hook on
 * getPrivateKeyForAddress is for — not to lock them out of their own funds.
 *
 * Note this is NOT the same as a device that can verify but whose user declines:
 * that throws, because a check was possible and was refused.
 *
 * @param purpose Shown in the system prompt. Say what the key is for, e.g.
 *                "Unlock your DeHub wallet" — a vague prompt trains people to
 *                approve reflexively.
 */
export async function requireDeviceOwner(purpose: string): Promise<VerificationOutcome> {
  const capability = await getBiometricCapability();
  if (!capability.usable) {
    log.warn("authenticate:unenforceable — device has no lock to check against", capability);
    return "unenforceable";
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
  return "verified";
}
