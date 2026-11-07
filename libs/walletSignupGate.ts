/**
 * The API's refusal of a wallet signup with no on-chain history.
 *
 * The gate lives in the backend's shared `authenticateAndRespond`, so it fires
 * on `POST /mobile/auth` exactly as it does on web — but only web was taught
 * to recognise it. Here the 330-character explanation arrived as a toast TITLE
 * at the default duration, under the heading "Could not import wallet", which
 * is the shape dehubweb#476 was merged specifically to stop.
 *
 * Mirrors web's `WalletSignupBlockedError` handling in `AuthProvider`.
 */
import { toastError } from './toast';
import { translateCopy as _translateCopy } from '../i18n/copy';

/** The API's code for a wallet signup turned away by the on-chain history gate. */
export const WALLET_SIGNUP_BLOCKED_CODE = 'WALLET_SIGNUP_REQUIRES_HISTORY';

/**
 * True when this error is the gate refusing to create an account.
 *
 * `libs/api.client.ts` attaches `status` and `code` from the response body, so
 * the code is matched directly rather than sniffed out of the message text —
 * the message is user-facing copy and one rewording away from breaking a
 * string match.
 */
export function isWalletSignupBlocked(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown } | null;
  return !!candidate && candidate.code === WALLET_SIGNUP_BLOCKED_CODE;
}

/**
 * Show the API's explanation, if that is what this error is. Returns whether it
 * handled the error, so callers keep their own fallback for everything else.
 */
export function reportWalletSignupBlocked(error: unknown): boolean {
  if (!isWalletSignupBlocked(error)) return false;
  const explanation = (error as { message?: string })?.message;
  // `null` as the error deliberately: toastError prefers the error's OWN text
  // for the headline, and the API's text is a paragraph. It belongs in the
  // description, under a headline short enough to read at a glance.
  toastError(null, _translateCopy('copy.043e8d07a119', { defaultValue: 'This wallet cannot open a new account' }), {
    description: explanation,
    duration: 15000,
  });
  return true;
}

/** The API's code for a wallet whose profile moved to a Google/email/phone login. */
export const PROFILE_MOVED_CODE = 'PROFILE_MOVED';

export function isProfileMoved(error: unknown): boolean {
  const candidate = error as { code?: unknown } | null;
  return !!candidate && (candidate.code === PROFILE_MOVED_CODE || candidate.code === 'PROFILE_ON_WALLET');
}

/**
 * This wallet's profile followed the person's Google/email/phone login, and the
 * API says which one. Before this the app showed the sentence as a toast title
 * under "Wallet authentication failed", or signed into the blank account the
 * old wallet was left with (@martvader, 2026-11-07). Mirrors web's
 * PROFILE_MOVED toast in AuthProvider.
 */
export function reportProfileMoved(error: unknown): boolean {
  if (!isProfileMoved(error)) return false;
  toastError(null, _translateCopy('copy.94cee2c8c1c1', { defaultValue: 'Your profile moved' }), {
    description: (error as { message?: string })?.message,
    duration: 15000,
  });
  return true;
}
