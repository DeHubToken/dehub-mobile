import { useEffect, useRef, useState } from "react";
import { presentationElapsedLabel } from "./usePresentationStopwatch";
export function usePresentationCountdown(foreground: boolean) {
  const [duration, setDuration] = useState(300), [remaining, setRemaining] = useState(300), [running, setRunning] = useState(false), stored = useRef(300000), started = useRef<number | null>(null), generation = useRef(0);
  const read = () => Math.max(0, stored.current - (started.current === null ? 0 : Math.max(0, Date.now() - started.current)));
  useEffect(() => {
    const token = ++generation.current;
    if (!running || !foreground) { setRemaining(Math.ceil(read() / 1000)); return; }
    started.current = Date.now();
    const tick = () => { if (generation.current !== token) return; const value = read(); setRemaining(Math.ceil(value / 1000)); if (value <= 0) { stored.current = 0; started.current = null; setRunning(false); } };
    tick(); const timer = setInterval(tick, 250);
    return () => { clearInterval(timer); if (generation.current === token) { stored.current = read(); started.current = null; setRemaining(Math.ceil(stored.current / 1000)); } };
  }, [running, foreground, duration]);
  const configure = (seconds: number) => { if (!Number.isInteger(seconds) || seconds < 30 || seconds > 7200) throw new Error("Choose a countdown from 30 seconds to 120 minutes"); generation.current++; stored.current = seconds * 1000; started.current = null; setDuration(seconds); setRemaining(seconds); setRunning(false); };
  const toggle = () => { if (!running && read() <= 0) { generation.current++; stored.current = duration * 1000; started.current = null; setRemaining(duration); } setRunning(value => !value); };
  return { duration, remaining, label: presentationElapsedLabel(remaining), running, finished: remaining === 0, configure, toggle, reset: () => configure(duration) };
}
