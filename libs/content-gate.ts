/**
 * Hold-gate resolution.
 * =====================
 * `streamInfo.isLockContent` on its own means nothing. The gate it describes is
 * "you must be holding N of token X to read this", so without a positive N there
 * is no condition to satisfy and no condition to fail — the post is simply open.
 *
 * Posts in exactly that state exist in prod because both composers' old
 * "Subscribers" switch set isLockContent with no amount (there has never been a
 * subscriber gate on the post model to back it). Those posts showed a lock badge
 * reading "Hold 0 DHB", and locked out anyone signed out, over a body the API
 * served in full anyway.
 *
 * Every surface that gates on holdings resolves it through here so the answer is
 * the same everywhere, and the same as web's src/lib/content-gate.ts.
 */
export function isHoldGated(
  isLockContent: boolean | undefined | null,
  lockContentAmount: number | string | undefined | null,
): boolean {
  return !!isLockContent && Number(lockContentAmount) > 0;
}
