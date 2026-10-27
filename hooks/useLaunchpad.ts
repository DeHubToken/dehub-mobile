import { useScreenActivity, useActiveScreenEffect } from "./useScreenActivity";
/**
 * Launchpad queries, kept live over Supabase realtime the way the web hooks
 * are. Trades land constantly, so the coin list coalesces bursts into at most
 * one refetch every few seconds instead of re-reading 100 rows per trade.
 */
import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import {
  getLaunchpadToken,
  listLaunchpadTokens,
  listLaunchpadTrades,
  listTrendingLaunchpadTokens,
  type LaunchpadFilter,
  type LaunchpadToken,
} from "../services/launchpad.service";

const LIST_REFRESH_THROTTLE_MS = 3_000;

export const launchpadKeys = {
  tokens: (filter: LaunchpadFilter, mine: string) => ["launchpad-tokens", filter, mine] as const,
  trending: ["launchpad-trending"] as const,
  token: (id: string) => ["launchpad-token", id] as const,
  trades: (tokenId: string) => ["launchpad-trades", tokenId] as const,
};

/**
 * Two mounts sharing a channel topic are not two subscriptions — removing one
 * on unmount takes the other's socket with it — so every instance gets its own
 * suffix (see hooks/useFractionMarket).
 */
function useChannelSuffix() {
  return useRef(Math.random().toString(36).slice(2)).current;
}

export function useLaunchpadTokens(filter: LaunchpadFilter, mineAddress?: string | null) {
  const { isActive } = useScreenActivity();
  const mine = (mineAddress || "").toLowerCase();
  const query = useQuery({
    enabled: isActive,
    queryKey: launchpadKeys.tokens(filter, mine),
    queryFn: () => listLaunchpadTokens(filter, mine || null),
    staleTime: 15_000,
  });

  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  const suffix = useChannelSuffix();
  const scoped = filter === "mine" ? mine : "";

  useActiveScreenEffect(() => {
    if (filter === "mine" && !mine) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refetchRef.current();
      }, LIST_REFRESH_THROTTLE_MS);
    };
    const ch = supabase
      .channel(`launchpad-tokens-${filter}-${suffix}`)
      .on(
        "postgres_changes" as any,
        scoped
          ? { event: "*", schema: "public", table: "launchpad_tokens", filter: `creator_address=eq.${scoped}` }
          : { event: "*", schema: "public", table: "launchpad_tokens" },
        schedule,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetchRef.current();
      });
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [filter, mine, scoped, suffix]);

  return query;
}

export function useTrendingLaunchpadTokens() {
  const { isActive } = useScreenActivity();
  return useQuery({
    enabled: isActive,
    queryKey: launchpadKeys.trending,
    queryFn: listTrendingLaunchpadTokens,
    staleTime: 30_000,
    refetchInterval: () => isActive() ? 30_000 : false,
  });
}

export function useLaunchpadToken(id?: string) {
  const { isActive } = useScreenActivity();
  const queryClient = useQueryClient();
  const suffix = useChannelSuffix();

  // The row is pushed over realtime; the interval is only a fallback for a
  // dropped socket.
  useActiveScreenEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`launchpad-token-${id}-${suffix}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "launchpad_tokens", filter: `id=eq.${id}` },
        (payload: { new?: Partial<LaunchpadToken> }) => {
          const row = payload.new;
          if (!row?.id) return;
          queryClient.setQueryData<LaunchpadToken | null>(launchpadKeys.token(id), (prev) =>
            prev ? { ...prev, ...row } : (row as LaunchpadToken),
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") queryClient.invalidateQueries({ queryKey: launchpadKeys.token(id) });
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, queryClient, suffix]);

  return useQuery({
    queryKey: launchpadKeys.token(id || ""),
    enabled: () => isActive() && !!id,
    queryFn: () => getLaunchpadToken(id as string),
    staleTime: 5_000,
    refetchInterval: () => isActive() ? 60_000 : false,
  });
}

/** Trades for one coin, or across every coin when `tokenId` is omitted. */
export function useLaunchpadTrades(tokenId?: string, limit = 50) {
  const { isActive } = useScreenActivity();
  const queryClient = useQueryClient();
  const suffix = useChannelSuffix();
  const scope = tokenId ?? "all";

  const query = useQuery({
    enabled: isActive,
    queryKey: launchpadKeys.trades(scope),
    queryFn: () => listLaunchpadTrades(tokenId, limit),
    staleTime: 5_000,
  });

  useActiveScreenEffect(() => {
    const ch = supabase
      .channel(`launchpad-trades-${scope}-${suffix}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "launchpad_trades",
          ...(tokenId ? { filter: `token_id=eq.${tokenId}` } : {}),
        },
        () => {
          queryClient.invalidateQueries({ queryKey: launchpadKeys.trades(scope) });
          if (tokenId) queryClient.invalidateQueries({ queryKey: launchpadKeys.token(tokenId) });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") queryClient.invalidateQueries({ queryKey: launchpadKeys.trades(scope) });
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [scope, tokenId, queryClient, suffix]);

  return query;
}
