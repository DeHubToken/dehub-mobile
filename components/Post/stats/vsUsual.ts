/**
 * The % on the view-count pill under a creator's own posts (same as web).
 *
 * A profile can show many of the creator's posts at once, so ids asked for in
 * the same moment go out together in one /post-stats/vs-usual call.
 */
import { useQuery } from "@tanstack/react-query";
import { getVsUsual, type PostVsUsual } from "../../../services/post-stats.service";

const BATCH_WAIT_MS = 40;
const BATCH_MAX = 60;

type Waiter = { resolve: (v: PostVsUsual | null) => void; reject: (e: unknown) => void };
let queue = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = queue;
  queue = new Map();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    const chunk = ids.slice(i, i + BATCH_MAX);
    getVsUsual(chunk).then(
      (result) => chunk.forEach((id) => batch.get(id)?.forEach((w) => w.resolve(result[id] ?? null))),
      (err) => chunk.forEach((id) => batch.get(id)?.forEach((w) => w.reject(err))),
    );
  }
}

function loadVsUsual(tokenId: string): Promise<PostVsUsual | null> {
  return new Promise((resolve, reject) => {
    const waiters = queue.get(tokenId) ?? [];
    waiters.push({ resolve, reject });
    queue.set(tokenId, waiters);
    if (!timer) timer = setTimeout(flush, BATCH_WAIT_MS);
  });
}

export function usePostVsUsual(tokenId: string | number | null | undefined, enabled = true) {
  const id = tokenId == null ? "" : String(tokenId);
  return useQuery({
    queryKey: ["post-vs-usual", id],
    queryFn: () => loadVsUsual(id),
    enabled: enabled && /^\d+$/.test(id),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** "+42%", "−18%", "0%", capped at "+999%". */
export function formatVsUsual(pct: number): string {
  if (pct > 0) return `+${pct >= 999 ? "999" : pct}%`;
  if (pct < 0) return `−${Math.abs(pct)}%`;
  return "0%";
}
