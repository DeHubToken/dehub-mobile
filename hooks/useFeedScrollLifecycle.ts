import { useCallback, useEffect, useRef } from 'react';
import { setFeedScrolling } from '../libs/scrollActivity';

/** Keep feed work paused across the finger-lift to momentum handoff. */
export function useFeedScrollLifecycle(onBegin: () => void, onSettled: () => void) {
  const callbacks = useRef({ onBegin, onSettled });
  callbacks.current = { onBegin, onSettled };
  const moving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSettle = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const begin = useCallback(() => {
    cancelSettle();
    setFeedScrolling(true);
    if (moving.current) return;
    moving.current = true;
    callbacks.current.onBegin();
  }, [cancelSettle]);
  const settle = useCallback(() => {
    cancelSettle();
    if (!moving.current) return;
    moving.current = false;
    setFeedScrolling(false);
    callbacks.current.onSettled();
  }, [cancelSettle]);
  const endDrag = useCallback(() => {
    cancelSettle();
    timer.current = setTimeout(settle, 120);
  }, [cancelSettle, settle]);
  useEffect(() => () => {
    cancelSettle();
    if (moving.current) setFeedScrolling(false);
  }, [cancelSettle]);
  return { begin, endDrag, settle };
}
