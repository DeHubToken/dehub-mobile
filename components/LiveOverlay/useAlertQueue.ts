import { useCallback, useEffect, useRef, useState } from "react";

/** How long an alert takes to animate out before the next one comes in. */
const LEAVE_MS = 380;

/**
 * Never hold more than this many alerts waiting. Past the cap the oldest
 * waiting alert is dropped, because the newest is the one the room is looking
 * at. The twin of dehubweb's use-alert-queue.ts.
 */
const MAX_WAITING = 8;

export interface QueuedAlert<T> {
  id: string;
  item: T;
  leaving: boolean;
}

/**
 * One alert on screen at a time, each for its own duration, the rest waiting
 * their turn. Every timer is cleared on unmount.
 */
export function useAlertQueue<T>(durationFor: (item: T) => number) {
  const [current, setCurrent] = useState<QueuedAlert<T> | null>(null);
  const waiting = useRef<T[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = useRef(false);
  const duration = useRef(durationFor);
  duration.current = durationFor;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const showNext = useCallback(() => {
    const next = waiting.current.shift();
    if (next === undefined) {
      busy.current = false;
      setCurrent(null);
      return;
    }
    busy.current = true;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCurrent({ id, item: next, leaving: false });
    const hold = Math.max(1500, duration.current(next));
    timers.current.push(
      setTimeout(() => {
        setCurrent((c) => (c && c.id === id ? { ...c, leaving: true } : c));
        timers.current.push(setTimeout(showNext, LEAVE_MS));
      }, hold),
    );
  }, []);

  const push = useCallback(
    (item: T) => {
      waiting.current.push(item);
      if (waiting.current.length > MAX_WAITING) waiting.current.shift();
      if (!busy.current) showNext();
    },
    [showNext],
  );

  return { current, push };
}
