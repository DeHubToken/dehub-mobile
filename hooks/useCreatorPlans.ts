/**
 * The signed-in creator's own subscription plans.
 *
 * Shared by the composer (which needs the plan ids to gate a post on) and the
 * subscriber sheet (which needs the plans themselves to sell). Both used to be
 * absent, which is why the "Subscribers" switch invented a DHB lock instead of
 * gating on the plans that were there all along.
 */
import { useQuery } from "@tanstack/react-query";
import { getPlans, type SubscriptionPlan } from "../services/subscription.service";
import { isSubscriberPlanBuyable } from "../libs/content-gate";

export function useCreatorPlans(creatorAddress?: string | null) {
  const address = creatorAddress?.toLowerCase();

  const query = useQuery({
    // Same key shape the Command Centre already uses, so a plan created there
    // and a plan read here never disagree.
    queryKey: ["cc-creator-plans", address],
    queryFn: () => getPlans(address!),
    enabled: !!address,
    staleTime: 60_000,
  });

  const plans: SubscriptionPlan[] = query.data ?? [];

  // A plan that is not on chain yet cannot be bought, so gating a post behind
  // one produces a post nobody can ever open. Only published plans count.
  const publishedPlans = plans.filter((p: any) => isSubscriberPlanBuyable(p));

  return {
    plans,
    publishedPlans,
    planIds: publishedPlans.map((p: any) => String(p.id ?? p._id)).filter(Boolean),
    /** Whether the creator has a plan a reader could actually buy. */
    hasPlans: publishedPlans.length > 0,
    /** Any plan at all, published or draft — for telling the two states apart. */
    hasAnyPlan: plans.length > 0,
    isLoading: query.isLoading,
  };
}
