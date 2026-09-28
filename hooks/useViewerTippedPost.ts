import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

/**
 * Whether this wallet has ever tipped this post — lights the tip gem on load.
 * Requests within one 50ms tick are merged into a single query per wallet, so
 * a feed page costs one read, not one per card. Answers are cached for the
 * session; a fresh tip lights the gem through libs/tip-events instead.
 */
const cache = new Map<string, boolean>();
const pending = new Map<string, Map<string, Array<(v: boolean) => void>>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const byWallet = new Map(pending);
  pending.clear();
  byWallet.forEach((batch, wallet) => {
    supabase
      .from("tip_records")
      .select("token_id")
      .in("token_id", [...batch.keys()])
      .eq("sender_address", wallet)
      .is("comment_id", null)
      .then(({ data, error }) => {
        if (error) console.warn("[ViewerTipped] load failed:", error.message);
        const hit = new Set((data || []).map((r: { token_id: string | number }) => String(r.token_id)));
        batch.forEach((resolvers, id) => {
          const v = hit.has(id);
          if (!error) cache.set(`${wallet}:${id}`, v);
          resolvers.forEach((resolve) => resolve(v));
        });
      });
  });
}

function request(tokenId: string, wallet: string): Promise<boolean> {
  return new Promise((resolve) => {
    const batch = pending.get(wallet) ?? new Map<string, Array<(v: boolean) => void>>();
    const list = batch.get(tokenId) ?? [];
    list.push(resolve);
    batch.set(tokenId, list);
    pending.set(wallet, batch);
    if (!timer) timer = setTimeout(flush, 50);
  });
}

export function useViewerTippedPost(tokenId?: number | string | null, walletAddress?: string | null): boolean {
  const wallet = walletAddress?.toLowerCase();
  const id = tokenId != null ? String(tokenId) : "";
  const key = `${wallet}:${id}`;
  const [tipped, setTipped] = useState(() => cache.get(key) ?? false);

  useEffect(() => {
    if (!wallet || !id) return;
    const known = cache.get(key);
    if (known !== undefined) { setTipped(known); return; }
    let cancelled = false;
    request(id, wallet).then((v) => { if (!cancelled) setTipped(v); });
    return () => { cancelled = true; };
  }, [wallet, id, key]);

  return tipped;
}
