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

/** One of the creator's subscription plans, as the feed returns it. */
export interface SubscriberPlan {
  id: number;
  title: string;
  price: number;
  alreadySubscribed?: boolean;
}

/**
 * Subscriber gate resolution.
 * ==========================
 * A different question to the hold gate above, and not interchangeable with it:
 * a hold gate asks "do you own N of this token", which any stranger satisfies by
 * buying some. A subscriber gate asks "do you subscribe to THIS creator", which
 * only they can grant.
 *
 * The backend has carried this all along — a post stores the plan ids that
 * unlock it, and the feed joins the viewer's subscriptions to stamp
 * `alreadySubscribed` on each. Both clients ignored it and faked a "Subscribers"
 * switch with an amount-less DHB lock instead. No plans is not a gate, for the
 * same reason a hold gate with no amount is not one.
 */
export function isSubscriberGated(
  plans: SubscriberPlan[] | undefined | null,
  canBypass: boolean,
): boolean {
  if (canBypass || !plans?.length) return false;
  return !plans.some((p) => p.alreadySubscribed);
}
