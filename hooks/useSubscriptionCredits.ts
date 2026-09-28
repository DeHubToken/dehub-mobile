import { useQuery } from "@tanstack/react-query";
import { useAuthState, useUser } from "../context/AuthContext";
import { getSubscriptionCredits } from "../services/credits.service";

/**
 * The signed-in user's subscription-token balance. Keyed under
 * "subscription-credits", which a top-up invalidates.
 */
export function useSubscriptionCredits(enabled = true) {
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const address = user?.walletAddress || user?.address;
  return useQuery({
    queryKey: ["subscription-credits", address?.toLowerCase() ?? null],
    queryFn: () => getSubscriptionCredits(address),
    enabled: enabled && isSignedIn && !!address,
    staleTime: 30_000,
    retry: false,
  });
}
