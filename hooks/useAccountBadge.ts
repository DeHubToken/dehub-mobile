/**
 * The staking badge for an account the payload names but carries no badge
 * for: governance discussion rows store only a handle and a wallet address.
 *
 * One request per name, shared by every row drawing it, under the same
 * `badge-balance` key lending a badge already invalidates.
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../libs/api.client";
import { getBadgeUrlFor } from "../libs/misc";

export function useAccountBadge(lookupId: string | null | undefined): number | undefined {
  const { data } = useQuery({
    queryKey: ["badge-balance", lookupId?.toLowerCase()],
    queryFn: async () => {
      // Public read: a badge is the same for every viewer, so no token wait.
      const res: any = await apiClient.get(`/account_info/${encodeURIComponent(lookupId!)}`, { isAuthRequired: false });
      return res?.result ?? res ?? null;
    },
    enabled: !!lookupId,
    staleTime: 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
  if (!data || data.hideBadgeAndBalance) return undefined;
  return getBadgeUrlFor(data);
}
