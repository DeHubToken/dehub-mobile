/**
 * Trending topics — which categories people are actually posting in.
 *
 * A port of dehubweb's `use-trending-categories`, reading the same table so
 * the two clients cannot disagree about what is trending. Three things about
 * that table are worth knowing before touching this:
 *
 * **It lives in dehubweb's Supabase, not in the DeHub API.** `category_post_log`
 * holds one row per post per category, written by a `sync-category-log` edge
 * function that pulls from the feed API. Nothing here writes to it.
 *
 * **The counting happens in Postgres.** The `category_counts` RPC groups the
 * log server-side and both clients call it, so the two still cannot disagree.
 * Normalising and merging stays on this side, over the ~335 rows that come
 * back rather than the 12,500 the table holds.
 *
 * **A "topic" is a CATEGORY.** Hashtags are folded into categories when a post
 * is created, and the raw tag is not stored anywhere, so a category is the
 * only thing this list can hold.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useTrendingTopic } from "./useSuperpowers";

export type TopicPeriod = "1d" | "1w" | "1m" | "1y" | "all";

export interface CategoryCount {
  name: string;
  post_count: number;
  /**
   * True when a badge holder paid a Trend Jacker to put this here.
   *
   * The row must be LABELLED wherever it renders. The list's whole pitch is
   * that it reflects what people are posting about, and an unlabelled paid
   * entry at position one makes that untrue — the same argument the boosted
   * post in the feed carries.
   */
  boosted?: boolean;
}

/** Dropped from the list on both clients. Keep in step with web's copy. */
const EXCLUDED_CATEGORIES = new Set(["general", "", "-", "other"]);
const TRENDING_CACHE_MS = 60_000;

function periodCutoff(period: TopicPeriod): string | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "1d":
      now.setDate(now.getDate() - 1);
      break;
    case "1w":
      now.setDate(now.getDate() - 7);
      break;
    case "1m":
      now.setMonth(now.getMonth() - 1);
      break;
    case "1y":
      now.setFullYear(now.getFullYear() - 1);
      break;
  }
  return now.toISOString();
}

function normalize(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

/** Ask Postgres for the tally. Returns every category, ranked. */
async function fetchTrendingCategories(period: TopicPeriod): Promise<CategoryCount[]> {
  const { data, error } = await supabase.rpc("category_counts" as never, {
    p_since: periodCutoff(period),
  } as never);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ name: string | null; post_count: number | string }>;
  const counts = new Map<string, number>();

  // Still merged here rather than trusted straight from the group-by: two raw
  // spellings can fold to the same key, and the exclusion list lives on the
  // clients. Over ~335 rows that is free.
  for (const row of rows) {
    const name = normalize(row.name);
    if (!name || EXCLUDED_CATEGORIES.has(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + Number(row.post_count ?? 0));
  }

  return Array.from(counts.entries())
    .map(([name, post_count]) => ({ name, post_count }))
    .sort((a, b) => b.post_count - a.post_count);
}

/**
 * Put the paid category first, keeping its real count.
 *
 * Its **real** count, never inflated. A trend that says three posts and sits
 * at number one is honest about what was bought: the position, not the
 * popularity. A category with nothing in this window still shows, at zero,
 * which is the truth for that window.
 */
function withBoosted(items: CategoryCount[], boosted: string | null | undefined): CategoryCount[] {
  const name = normalize(boosted);
  if (!name) return items;

  const existing = items.find(c => c.name === name);
  const rest = items.filter(c => c.name !== name);
  return [{ name, post_count: existing?.post_count ?? 0, boosted: true }, ...rest];
}

/**
 * Trending categories for one window, with any paid one lifted to the top.
 *
 * The splice lives HERE rather than in the list component, so every surface
 * that renders trending topics gets it — a holder who bought the top of the
 * list should not depend on which screen remembered to implement it.
 */
export function useTrendingCategories(period: TopicPeriod = "1w") {
  const { data: jacked } = useTrendingTopic();

  const query = useQuery<CategoryCount[]>({
    queryKey: ["trending-categories", period],
    queryFn: () => fetchTrendingCategories(period),
    staleTime: TRENDING_CACHE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    // The screen renders perfectly well without it.
    retry: false,
    placeholderData: prev => prev,
  });

  const data = useMemo(
    () => withBoosted(query.data ?? [], jacked?.category),
    [query.data, jacked?.category],
  );

  return { ...query, data };
}
