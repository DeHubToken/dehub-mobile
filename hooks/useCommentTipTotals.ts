import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase";

/** How many tipped comments lead the thread, under the creator's pin. */
export const TOP_TIPPED_COUNT = 5;

/**
 * DHB already tipped per comment, read from Supabase tip_records in one query
 * per POST. Comment tips are the rows carrying a comment_id — written by
 * GlassTipSheet after the tip confirms on-chain (web writes the same rows from
 * its TipModal).
 *
 * Keyed on the post rather than on the ids currently loaded, because the
 * answer is also what decides the order: the five best-tipped comments lead
 * the thread, and a query scoped to the loaded window could only ever rank the
 * window. `topTippedIds` goes to the comments API, which floats them onto
 * page 0.
 */
export function useCommentTipTotals(tokenId: number | string | undefined) {
  const [totals, setTotals] = useState<Record<number, number>>({});

  useEffect(() => {
    if (tokenId == null) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("tip_records")
        .select("comment_id, amount")
        .eq("token_id", String(tokenId))
        .not("comment_id", "is", null);
      if (cancelled) return;
      if (error) {
        console.warn("[CommentTips] load failed:", error.message);
        return;
      }
      const next: Record<number, number> = {};
      for (const r of (data || []) as Array<{
        comment_id: string | null;
        amount: number;
      }>) {
        if (!r.comment_id) continue;
        const id = Number(r.comment_id);
        if (!Number.isFinite(id)) continue;
        next[id] = (next[id] || 0) + Number(r.amount);
      }
      setTotals(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  /** Add a just-sent tip to a comment's total without refetching. */
  const bump = useCallback((commentId: number, amount: number) => {
    setTotals((prev) => ({
      ...prev,
      [commentId]: (prev[commentId] || 0) + amount,
    }));
  }, []);

  const topTippedIds = useMemo(
    () =>
      Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_TIPPED_COUNT)
        .map(([id]) => Number(id)),
    [totals],
  );

  return { totals, bump, topTippedIds };
}
