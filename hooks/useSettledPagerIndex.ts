import { useCallback, useEffect, useRef } from 'react';

/** Keep player creation out of a pager's drag and momentum frames. */
export function useSettledPagerIndex(commit: (index: number) => void, height: number, count: number) {
  const moving = useRef(false);
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
    const { commit, height, count } = config.current;
    if (height > 0 && count > 0 && Number.isFinite(offset)) {
      commit(Math.max(0, Math.min(count - 1, Math.round(offset / height))));
    }
  }, [cancel]);

  const begin = useCallback(() => {
    cancel();
    moving.current = true;
  }, [cancel]);
  const endDrag = useCallback((offset: number) => {
    cancel();
    // Android also allows a release with no momentum-end event. A momentum
    // start cancels this fallback and leaves the landing to settle().
    timer.current = setTimeout(() => settle(offset), 160);
  }, [cancel, settle]);
  const candidate = useCallback((index: number) => {
    if (!moving.current && index >= 0 && index < config.current.count) {
      config.current.commit(index);
    }
  }, []);

  return { begin, endDrag, settle, candidate };
}
