import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase";

/**
 * DHB already tipped per comment, read from Supabase tip_records in one
 * query per loaded comment set. Comment tips are the rows carrying a
 * comment_id — written by GlassTipSheet after the tip confirms on-chain
 * (web writes the same rows from its TipModal).
 */
export function useCommentTipTotals(commentIds: number[]) {
  const [totals, setTotals] = useState<Record<number, number>>({});
  // A join key makes the effect re-run only when the actual id set changes,
  // not on every render's fresh array identity.
  const idsKey = commentIds
    .slice()
    .sort((a, b) => a - b)
    .join(",");
  const idsRef = useRef(commentIds);
  idsRef.current = commentIds;

  useEffect(() => {
    if (idsRef.current.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("tip_records")
        .select("comment_id, amount")
        .in("comment_id", idsRef.current.map(String));
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
  }, [idsKey]);

  /** Add a just-sent tip to a comment's total without refetching. */
  const bump = useCallback((commentId: number, amount: number) => {
    setTotals((prev) => ({
      ...prev,
      [commentId]: (prev[commentId] || 0) + amount,
    }));
  }, []);

  return { totals, bump };
}
