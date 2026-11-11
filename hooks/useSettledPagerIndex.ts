import { useCallback, useEffect, useRef } from 'react';

/**
 * A page counts as landed once it is this close to rest (a share of the page
 * height) and barely moving. The snap's last stretch eases out slowly, and
 * waiting for momentum-end there held every short on its still for a beat.
 */
const LANDED_DISTANCE = 0.03;
/** Page heights per millisecond; a flick passing a page boundary is far faster. */
const LANDED_SPEED = 0.0015;

/** Keep player creation out of a pager's drag and momentum frames. */
export function useSettledPagerIndex(commit: (index: number) => void, height: number, count: number) {
  const moving = useRef(false);
  const dragging = useRef(false);
  const latestOffset = useRef(0);
  const lastSample = useRef<{ offset: number; at: number } | null>(null);
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
    const now = Date.now();
    const previous = lastSample.current;
    lastSample.current = { offset, at: now };
    if (!moving.current || dragging.current) return;
    const { height } = config.current;
    if (previous && height > 0 && now > previous.at) {
      const speed = Math.abs(offset - previous.offset) / (now - previous.at) / height;
      const fromRest = Math.abs(offset - Math.round(offset / height) * height) / height;
      if (fromRest <= LANDED_DISTANCE && speed <= LANDED_SPEED) {
        settle(offset);
        return;
      }
    }
    cancel();
    // Some Android releases omit momentum-end after an interrupted snap.
    // Commit only after the native list has stopped producing scroll events.
    timer.current = setTimeout(() => settle(latestOffset.current), 160);
  }, [cancel, settle]);

  const begin = useCallback(() => {
    cancel();
    lastSample.current = null;
    moving.current = true;
    dragging.current = true;
  }, [cancel]);
  const momentum = useCallback(() => {
    cancel();
    lastSample.current = null;
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
