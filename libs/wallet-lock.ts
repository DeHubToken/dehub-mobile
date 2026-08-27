/**
 * "Signed in, wallet locked" — the state this app used to refuse to be in.
 *
 * Sign-in used to require a private key on THIS device: useAuthSession's
 * session exchange bailed with `refusing-session-without-local-signer`, and
 * provision-and-sign-in routed every unopenable cloud wallet straight to the
 * unlock sheet before the session existed. The result was that anyone whose
 * wallet was wrapped with a key this handset does not hold — a biometric
 * wallet after a reinstall, most commonly — could not get past the sign-in
 * screen at all, while the same account signed into dehub.io fine (web has
 * always completed login with the wallet locked; see AuthProvider's
 * completeLoginWithoutUnlock).
 *
 * Logging in and proving you can spend are different questions. This module
 * is how the second one gets asked, at the moment it actually matters:
 * `WalletUnlockHost` registers a handler, the locked provider shim calls
 * `requestWalletUnlock` when a signing method is invoked, and everything in
 * between — feeds, profiles, DMs, settings — never asks at all.
 *
 * Nothing here holds key material. The handler's job is to put the key on the
 * device (identity-wallet's finishWalletUnlock does that); this only reports
 * whether that happened.
 */
import { createLogger } from "./logger";

const log = createLogger("wallet-lock");

/**
 * Resolves true once this device holds a usable private key for the signed-in
 * account, false if the user backed out or the unlock failed.
 */
export type WalletUnlockHandler = () => Promise<boolean>;

let handler: WalletUnlockHandler | null = null;
let inFlight: Promise<boolean> | null = null;

/**
 * Thrown when a signing method was reached, the user was asked to unlock, and
 * declined or could not. Callers should treat this as a cancellation rather
 * than a failure — the user chose not to sign, exactly as they might dismiss a
 * hardware wallet prompt.
 */
export class WalletLockedError extends Error {
  constructor(message = "Your wallet is locked. Unlock it to continue.") {
    super(message);
    this.name = "WalletLockedError";
  }
}

/**
 * Mounted once, at the app root. Returns its own unregister function rather
 * than clearing unconditionally, so a remount that races an unmount cannot
 * leave the app with no host — the late unmount only clears itself.
 */
export function registerWalletUnlockHandler(fn: WalletUnlockHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function hasWalletUnlockHandler(): boolean {
  return handler !== null;
}

/**
 * Ask the user to unlock, and wait for the answer.
 *
 * Concurrent callers share one prompt. A single tap on "post" can fan out into
 * several signing calls (estimate, then send) and a screen can mount two
 * signers at once; without coalescing, each would stack its own copy of the
 * sheet and the user would dismiss the same question three times.
 */
export async function requestWalletUnlock(reason: string): Promise<boolean> {
  const current = handler;
  if (!current) {
    // No host mounted: signed out, or the root is still booting. Refusing is
    // right — inventing a prompt here would have nothing to render it.
    log.warn("requestWalletUnlock:no-host", { reason });
    return false;
  }
  if (inFlight) {
    log.info("requestWalletUnlock:joining-in-flight", { reason });
    return inFlight;
  }
  log.info("requestWalletUnlock:asking", { reason });
  const run = (async () => {
    try {
      return await current();
    } catch (e) {
      log.warn("requestWalletUnlock:error", e);
      return false;
    }
  })();
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}
