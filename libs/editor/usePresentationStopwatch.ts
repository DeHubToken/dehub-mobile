import { useEffect, useRef, useState } from "react";
export function presentationElapsedLabel(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0, hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, rest = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
export function usePresentationStopwatch(foreground: boolean) {
  const accumulated = useRef(0), started = useRef<number | null>(null), [running, setRunning] = useState(true), [elapsed, setElapsed] = useState(0);
  const read = () => accumulated.current + (started.current === null ? 0 : Math.max(0, Date.now() - started.current));
  useEffect(() => {
    if (!running || !foreground) { setElapsed(Math.floor(read() / 1000)); return; }
    started.current = Date.now(); setElapsed(Math.floor(read() / 1000));
    const timer = setInterval(() => setElapsed(Math.floor(read() / 1000)), 1000);
    return () => { clearInterval(timer); if (started.current !== null) accumulated.current += Math.max(0, Date.now() - started.current); started.current = null; };
  }, [running, foreground]);
  const reset = () => { accumulated.current = 0; started.current = running && foreground ? Date.now() : null; setElapsed(0); };
  return { elapsed, label: presentationElapsedLabel(elapsed), running, toggle: () => setRunning(value => !value), reset };
}
