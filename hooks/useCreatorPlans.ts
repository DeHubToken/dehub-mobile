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

  return {
    plans,
    planIds: plans.map((p: any) => String(p.id ?? p._id)).filter(Boolean),
    hasPlans: plans.length > 0,
    isLoading: query.isLoading,
  };
}
