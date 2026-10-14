import { useCallback, useEffect, useRef } from 'react';

/** Keep player creation out of a pager's drag and momentum frames. */
export function useSettledPagerIndex(commit: (index: number) => void, height: number, count: number) {
  const moving = useRef(false);
  const dragging = useRef(false);
  const latestOffset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const config = useRef({ commit, height, count });
  config.current = { commit, height, count };

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => cancel, [cancel]);

  const settle = useCallback((offset: number) => {
    cancel();
    moving.current = false;
    dragging.current = false;
    const { commit, height, count } = config.current;
    if (height > 0 && count > 0 && Number.isFinite(offset)) {
      commit(Math.max(0, Math.min(count - 1, Math.round(offset / height))));
    }
  }, [cancel]);

  const observe = useCallback((offset: number) => {
    latestOffset.current = offset;
    if (!moving.current || dragging.current) return;
    cancel();
    // Some Android releases omit momentum-end after an interrupted snap.
    // Commit only after the native list has stopped producing scroll events.
    timer.current = setTimeout(() => settle(latestOffset.current), 160);
  }, [cancel, settle]);

  const begin = useCallback(() => {
    cancel();
    moving.current = true;
    dragging.current = true;
  }, [cancel]);
  const momentum = useCallback(() => {
    cancel();
    moving.current = true;
    dragging.current = false;
  }, [cancel]);
  const endDrag = useCallback((offset: number) => {
    cancel();
    latestOffset.current = offset;
    dragging.current = false;
    // Android also allows a release with no momentum-end event. A momentum
    // start cancels this fallback and leaves the landing to settle().
    timer.current = setTimeout(() => settle(latestOffset.current), 160);
  }, [cancel, settle]);
  const candidate = useCallback((index: number) => {
    if (!moving.current && index >= 0 && index < config.current.count) {
      config.current.commit(index);
    }
  }, []);

  return { begin, momentum, endDrag, settle, candidate, observe };
}
