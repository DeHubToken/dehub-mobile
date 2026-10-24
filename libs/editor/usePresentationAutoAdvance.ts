import { useEffect, useRef, useState } from "react";

/** Pause the presentation clock without losing the remaining time on its current page. */
export function usePresentationAutoAdvance({ identity, enabled, paused, duration, onAdvance }: {
  identity: string; enabled: boolean; paused: boolean; duration: number; onAdvance: () => void;
}) {
  const seconds = Number.isFinite(duration) ? Math.max(0.25, Math.min(86400, duration)) : 5;
  const remaining = useRef(seconds * 1000), callback = useRef(onAdvance); callback.current = onAdvance;
  const [left, setLeft] = useState(seconds);
  useEffect(() => { remaining.current = seconds * 1000; setLeft(seconds); }, [identity, seconds, enabled]);
  useEffect(() => {
    if (!enabled || paused) return;
    const deadline = Date.now() + remaining.current;
    let timer: ReturnType<typeof setTimeout> | null = null, ended = false;
    const tick = () => {
      remaining.current = Math.max(0, deadline - Date.now()); setLeft(remaining.current / 1000);
      if (remaining.current <= 0) { ended = true; callback.current(); return; }
      timer = setTimeout(tick, Math.min(250, remaining.current));
    };
    tick();
    return () => { if (timer) clearTimeout(timer); if (!ended) remaining.current = Math.max(0, deadline - Date.now()); };
  }, [identity, seconds, enabled, paused]);
  return { remaining: left, progress: Math.max(0, Math.min(1, 1 - left / seconds)) };
}
