/**
 * The badge ladder's scale
 * ========================
 * Badge tiers are pegged in dollars (see `libs/misc`), so the DHB a tier costs
 * depends on what DHB is worth. This resolves that one number and publishes it.
 *
 * One owner fetches — `<BadgeLadderSync/>`, mounted once in App.tsx — and
 * everything else reads the module-level scale that sync publishes. That is
 * deliberate rather than lazy: `getBadgeUrl` is called from feed cards, chat
 * rows, leaderboard rows and quota maths, most of them nowhere near a hook, so
 * the scale has to be readable without one.
 *
 * It rides the `["token-prices"]` cache the stores screens already fill, so on
 * those there is no extra request at all.
 *
 * The price is a client read, so it is advisory: two people looking at the same
 * profile a minute apart could resolve slightly different rungs while a price
 * is moving. That is invisible while DHB is pinned to the anchor, and the fix
 * when it is not is for the API to send the scale it used.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import env from "../config/env";
import {
  activeBadgeScale,
  badgeScaleForPrice,
  setActiveBadgeScale,
} from "../libs/misc";

/** Shared with `useTokenPrices` in hooks/useStores — same endpoint, same entry. */
export const TOKEN_PRICES_QUERY_KEY = ["token-prices"] as const;

type TokenPrices = Record<string, number>;

async function fetchTokenPrices(): Promise<TokenPrices> {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/get-dhb-price`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!res.ok) throw new Error(`Price lookup failed: ${res.status}`);
  const data = await res.json();
  return (data?.prices ?? {}) as TokenPrices;
}

/**
 * Own the ladder scale: fetch the price, publish the scale, hand it back.
 *
 * The price moves the ladder in two-significant-figure steps, so there is
 * nothing to gain from watching it closely — five minutes stale is well inside
 * the resolution of the thing it feeds.
 */
export function useBadgeLadderScale(): number {
  const { data } = useQuery<TokenPrices>({
    queryKey: TOKEN_PRICES_QUERY_KEY,
    queryFn: fetchTokenPrices,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });

  const scale = badgeScaleForPrice(data?.DHB);

  useEffect(() => {
    setActiveBadgeScale(scale);
  }, [scale]);

  return scale;
}

/**
 * Read the scale without owning the fetch.
 *
 * Falls back to whatever the last sync published, so a badge drawn before the
 * first price lands uses the reference ladder rather than nothing.
 */
export function useBadgeScale(): number {
  const { data } = useQuery<TokenPrices>({
    queryKey: TOKEN_PRICES_QUERY_KEY,
    queryFn: fetchTokenPrices,
    // The sync owns the fetching; this observer only tracks its answer.
    enabled: false,
    staleTime: Infinity,
  });

  return data?.DHB ? badgeScaleForPrice(data.DHB) : activeBadgeScale();
}

/** The DHB price the ladder is using, for surfaces that quote it in dollars. */
export function useBadgeLadderPrice(): number | undefined {
  const { data } = useQuery<TokenPrices>({
    queryKey: TOKEN_PRICES_QUERY_KEY,
    queryFn: fetchTokenPrices,
    enabled: false,
    staleTime: Infinity,
  });

  const price = data?.DHB;
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? price
    : undefined;
}
