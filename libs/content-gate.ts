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

/** One chain a plan is sold on. The price and the on-chain state live here. */
export interface SubscriberPlanChain {
  chainId?: number;
  token?: string;
  price?: number;
  isPublished?: boolean;
  status?: boolean;
}

/**
 * One of the creator's subscription plans, as the feed returns it.
 *
 * This shape was previously declared as `{ id, title, price }`, and the server
 * sends none of those three: the label is `name`, the id is a string, and there
 * is no top-level `price` at all — it sits on each chain entry. Web read
 * `plan.price` off the back of this and rendered "Subscribe from 0 DHB".
 * Resolve both through the helpers below, never by hand.
 */
export interface SubscriberPlan {
  id?: string | number;
  _id?: string;
  name?: string;
  /** Never sent by the API; kept so older callers still type-check. */
  title?: string;
  price?: number;
  duration?: number;
  chains?: SubscriberPlanChain[];
  isPublished?: boolean;
  alreadySubscribed?: boolean;
}

/**
 * The chain a purchase should target — one the creator has actually published
 * on, because buying an unpublished one reverts in the buyer's wallet.
 */
export function primarySubscriberPlanChain(
  plan: SubscriberPlan,
): SubscriberPlanChain | undefined {
  const chains = plan.chains || [];
  return chains.find((c) => c.isPublished) || chains[0];
}

/** Can anyone actually buy this plan right now? */
export function isSubscriberPlanBuyable(plan: SubscriberPlan): boolean {
  if (typeof plan.isPublished === "boolean") return plan.isPublished;
  return (plan.chains || []).some((c) => c.isPublished);
}

/** Headline price, from whichever source the server gave us. */
export function subscriberPlanPrice(
  plan: SubscriberPlan | undefined | null,
): number | undefined {
  if (!plan) return undefined;
  if (typeof plan.price === "number") return plan.price;
  const price = primarySubscriberPlanChain(plan)?.price;
  return typeof price === "number" ? price : undefined;
}

/**
 * The cheapest plan a reader could actually buy to get in. Unbuyable plans are
 * skipped because naming their price is an invitation to a disabled button.
 */
export function cheapestSubscriberPlan(
  plans: SubscriberPlan[] | undefined | null,
): SubscriberPlan | undefined {
  const priced = (plans || [])
    .filter(isSubscriberPlanBuyable)
    .filter((p) => subscriberPlanPrice(p) !== undefined);
  if (!priced.length) return undefined;
  return priced.reduce((a, b) =>
    (subscriberPlanPrice(b) as number) < (subscriberPlanPrice(a) as number) ? b : a,
  );
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
 *
 * Neither is a set of plans nobody can buy. The composer attaches every plan
 * the creator owns the moment the Subscribers switch is on, and it counted
 * unpublished drafts as plans — so a post could be gated behind a plan whose
 * Subscribe button is permanently disabled. That is not a gate, it is a post
 * nobody will ever read, so it resolves to open here on the same principle.
 */
export function isSubscriberGated(
  plans: SubscriberPlan[] | undefined | null,
  canBypass: boolean,
): boolean {
  if (canBypass || !plans?.length) return false;
  if (plans.some((p) => p.alreadySubscribed)) return false;
  return plans.some(isSubscriberPlanBuyable);
}
