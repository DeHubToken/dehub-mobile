/**
 * The message for a sign-in that reached a deleted account.
 *
 * The API answers such a sign-in with code ACCOUNT_DELETED and, while the
 * login is still attached to the account being removed, the time it becomes
 * free again. Shared wording with web's `src/lib/deleted-account.ts`.
 *
 * @module libs/deleted-account
 */
import { translateCopy } from '../i18n/copy';

export const ACCOUNT_DELETED_CODE = 'ACCOUNT_DELETED';

const HOUR_MS = 60 * 60_000;

export function deletedAccountMessage(signupAfter?: string | null, now = Date.now()): string {
  const at = signupAfter ? new Date(signupAfter).getTime() : NaN;
  const left = at - now;
  if (!Number.isFinite(left) || left <= 0) {
    return translateCopy('auth.accountDeleted', { defaultValue: 'This account was deleted. You can sign up again as a new account.' });
  }
  const hours = Math.max(1, Math.ceil(left / HOUR_MS));
  if (hours <= 48) {
    return translateCopy('auth.accountDeletedHours', {
      count: hours,
      defaultValue: hours === 1
        ? 'This account was deleted. You can sign up again with the same email or phone in about {{count}} hour.'
        : 'This account was deleted. You can sign up again with the same email or phone in about {{count}} hours.',
    });
  }
  const days = Math.ceil(hours / 24);
  return translateCopy('auth.accountDeletedDays', {
    count: days,
    defaultValue: 'This account was deleted. You can sign up again with the same email or phone in about {{count}} days.',
  });
}
