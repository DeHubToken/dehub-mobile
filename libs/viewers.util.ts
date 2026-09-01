export type ViewerStats = {
  liveViewers: number;
  peakViewers: number;
};

// Extract initial viewer stats from a stream entity with safe fallbacks.
//
// The field names mean the opposite of what this used to assume. On the
// backend `peakViewers` IS the high-water mark and `totalViews` counts JOINS —
// so a single viewer whose connection drops and returns three times makes
// totalViews 3 while only one person was ever there (seen in production on
// 2026-09-01). Seeding "live" from peakViewers therefore opened the producer
// console on a number that could only climb, and "Peak" on a reconnect tally.
//
// `viewerCount` is the real concurrent figure, straight off the presence
// gateway's own counter. The old fields stay as a fallback for an API that
// predates it, where the seed is at least in the right order of magnitude
// until the first socket update replaces it.
export function seedViewerStats(entity: any | null | undefined): ViewerStats {
  const e = entity as any;
  const live =
    typeof e?.viewerCount === 'number'
      ? (e.viewerCount as number)
      : typeof e?.peakViewers === 'number'
        ? (e.peakViewers as number)
        : 0;
  const peak = typeof e?.peakViewers === 'number' ? (e.peakViewers as number) : 0;
  return { liveViewers: live || 0, peakViewers: Math.max(peak, live) };
}

type UpdaterParams = {
  setLive: (n: number) => void;
  setPeak: (n: number) => void;
  getPeak: () => number;
  debounceMs?: number;
};

// Factory to create a debounced updater for viewer counts
export function createViewCountUpdater({ setLive, setPeak, getPeak, debounceMs = 500 }: UpdaterParams) {
  let lastPush = 0;
  let latest = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const push = () => {
    setLive(latest);
    // Only update peak (all-time) when current viewers actually exceed it
    const currentPeak = getPeak();
    if (latest > currentPeak) {
      setPeak(latest);
    }
    lastPush = Date.now();
  };

  const onViewCount = (viewerCount: number) => {
    latest = typeof viewerCount === 'number' ? viewerCount : 0;
    const now = Date.now();
    const delta = now - lastPush;
    if (delta >= debounceMs) {
      push();
    } else if (!timer) {
      timer = setTimeout(() => {
        try { if (timer) clearTimeout(timer); } catch {}
        timer = null;
        push();
      }, Math.max(0, debounceMs - delta));
    }
  };

  const dispose = () => {
    try { if (timer) clearTimeout(timer); } catch {}
    timer = null;
  };

  return { onViewCount, dispose };
}
