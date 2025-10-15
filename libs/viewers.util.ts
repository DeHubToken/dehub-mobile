export type ViewerStats = {
  liveViewers: number;
  peakViewers: number;
};

// Extract initial viewer stats from a stream entity with safe fallbacks
export function seedViewerStats(entity: any | null | undefined): ViewerStats {
  const live = typeof (entity as any)?.totalViews === 'number' ? (entity as any).totalViews as number : 0;
  const peak = typeof (entity as any)?.peakViewers === 'number' ? (entity as any).peakViewers as number : 0;
  return { liveViewers: live || 0, peakViewers: peak || 0 };
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
