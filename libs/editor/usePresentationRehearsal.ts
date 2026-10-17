import { useEffect, useRef, useState } from "react";
export interface RehearsedPageTiming { index: number; seconds: number }
export function usePresentationRehearsal(pageIndex: number, active: boolean) {
  const totals = useRef(new Map<number, number>()), started = useRef<{ index: number; at: number } | null>(null), [running, setRunning] = useState(false), [, redraw] = useState(0);
  const read = (): RehearsedPageTiming[] => {
    const result = new Map(totals.current), current = started.current;
    if (current) result.set(current.index, (result.get(current.index) ?? 0) + Math.max(0, Date.now() - current.at));
    return [...result].filter(([, milliseconds]) => milliseconds >= 100).map(([index, milliseconds]) => ({ index, seconds: Math.round(milliseconds / 100) / 10 })).sort((a, b) => a.index - b.index);
  };
  useEffect(() => {
    if (running && active) started.current = { index: pageIndex, at: Date.now() };
    redraw(value => value + 1);
    const timer = running && active ? setInterval(() => redraw(value => value + 1), 1000) : undefined;
    return () => {
      if (timer !== undefined) clearInterval(timer);
      const current = started.current;
      if (current) totals.current.set(current.index, (totals.current.get(current.index) ?? 0) + Math.max(0, Date.now() - current.at));
      started.current = null;
    };
  }, [running, active, pageIndex]);
  const reset = () => { totals.current.clear(); started.current = running && active ? { index: pageIndex, at: Date.now() } : null; redraw(value => value + 1); };
  return { running, toggle: () => setRunning(value => !value), reset, read, entries: read() };
}
