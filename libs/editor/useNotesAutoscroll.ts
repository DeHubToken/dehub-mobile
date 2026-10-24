import { useEffect, useRef, useState } from "react";
export function useNotesAutoscroll(identity: string, active: boolean, step: (pixels: number) => boolean) {
  const [running, setRunning] = useState(false), [speed, setSpeed] = useState(24), advance = useRef(step); advance.current = step;
  useEffect(() => { setRunning(false); }, [identity]);
  useEffect(() => {
    if (!running || !active) return;
    let frame = 0, previous = 0, alive = true;
    const tick = (now: number) => { if (!alive) return; const elapsed = previous ? Math.min(100, Math.max(0, now - previous)) : 0; previous = now; if (elapsed && !advance.current(elapsed * speed / 1000)) { setRunning(false); return; } frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [running, active, speed]);
  return { running, setRunning, speed, setSpeed };
}
