/**
 * The one case where this identity's account is NOT at the wallet this device
 * holds — recorded when the Supabase exchange refuses a session, and consumed
 * by the signature login that follows.
 *
 * Why it has to be carried between the two: the exchange is the only thing
 * that learns which address the backend has the account at, and it refuses
 * precisely when that is not an address this device can sign for. It then
 * falls back to a signature — which the backend reads as a BRAND-NEW SIGNUP,
 * because the address signing it has no account. Before the wallet-history
 * gate that produced a second empty account beside the real one; since the
 * gate it produces nothing at all, because a wallet minted on this device has
 * no history to show. Either way the account, its username, its posts and its
 * messages stay at an address nobody can sign for.
 *
 * dehubweb hit exactly this and fixed it in #773; the two clients must not
 * drift on it.
 *
 * Deliberately module state rather than storage. A drift is only actionable
 * inside the login attempt that detected it: the address it names is what the
 * BACKEND believed one moment ago, and re-applying that on a later launch —
 * after a rotation, a reset, or a sign-in on another device — would move an
 * account on evidence that had gone stale.
 */

export interface WalletDrift {
  /** Address the backend has this identity's account at. */
  linked: string;
  /** Owner EOA in user_wallets — the wallet this device can actually sign for. */
  ownerEoa: string;
  /** Whose drift this is, so another identity's login cannot consume it. */
  supabaseUserId: string;
}

let pending: WalletDrift | null = null;

export function recordWalletDrift(drift: WalletDrift): void {
  pending = {
    linked: drift.linked.toLowerCase(),
    ownerEoa: drift.ownerEoa.toLowerCase(),
    supabaseUserId: drift.supabaseUserId,
  };
}

/**
 * Read and clear. One drift gets one rescue: a failed attempt must not leave
 * the next signature in this session acting on a state the first may already
 * have changed.
 */
export function takeWalletDrift(): WalletDrift | null {
  const drift = pending;
  pending = null;
  return drift;
}

export function clearWalletDrift(): void {
  pending = null;
}

/**
 * May the account be moved onto the address that is about to sign?
 *
 * Only for the identity's OWN wallet — the EOA `user_wallets` names, or the
 * Safe predicted from it. Anything else signing in is a wallet the user
 * reached deliberately (an imported key, an external wallet), and on this
 * client that already means "switch accounts"; turning it into "bring the
 * account along" would be a surprise rather than a fix.
 *
 * `predictedSafe` is passed in rather than derived here so this stays pure —
 * the prediction is an async CREATE2 computation with its own failure modes,
 * and null (it could not be computed) must read as "not proven", never as
 * "close enough".
 */
export function isIdentitysOwnWallet(
  drift: WalletDrift,
  signingAddress: string,
  predictedSafe: string | null,
): boolean {
  const signing = signingAddress.toLowerCase();
  if (signing === drift.ownerEoa) return true;
  return !!predictedSafe && predictedSafe.toLowerCase() === signing;
}
