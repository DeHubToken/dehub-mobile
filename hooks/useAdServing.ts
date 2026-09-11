/**
 * Native POVR ad delivery.
 *
 * Uses the same ads-serve and ads-track edge functions as web. Targeting,
 * frequency caps, pricing and event deduplication stay server-owned; the app
 * supplies only viewer identity, surface and IAB-style viewability events.
 */
import { useQuery } from "@tanstack/react-query";
import { useUser } from "../context/AuthContext";
import { getAnonViewerId } from "../services/anonView.service";
import { supabase } from "../services/supabase";
import type { ServedAd } from "./useAds";

const reported = new Set<string>();

export interface UseServedAdsOptions {
  count?: number;
  categories?: string[];
  enabled?: boolean;
}

export function useServedAds(surface: string, options: UseServedAdsOptions = {}) {
  const user = useUser();
  const wallet = user?.walletAddress || user?.address;
  const { count = 1, categories, enabled = true } = options;

  return useQuery({
    queryKey: ["served-ads", surface, wallet?.toLowerCase() ?? "anon", count, categories],
    enabled,
    staleTime: 120_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<ServedAd[]> => {
      try {
        const anonId = await getAnonViewerId();
        const { data, error } = await supabase.functions.invoke("ads-serve", {
          body: {
            viewerWallet: wallet?.toLowerCase() || undefined,
            anonId,
            surface,
            categories,
            count,
          },
        });
        if (error || data?.error) return [];
        return (data?.ads as ServedAd[]) ?? [];
      } catch {
        return [];
      }
    },
  });
}

export function hasTrackedAdEvent(ad: ServedAd, event: "impression" | "click") {
  return reported.has(`${ad.serveId}:${event}`);
}

export function trackAdEvent(ad: ServedAd, event: "impression" | "click"): void {
  const key = `${ad.serveId}:${event}`;
  if (reported.has(key)) return;
  reported.add(key);

  void supabase.functions.invoke("ads-track", {
    body: { token: ad.token, event },
  }).then(({ error, data }) => {
    if (error || data?.error) reported.delete(key);
  }).catch(() => reported.delete(key));
}
