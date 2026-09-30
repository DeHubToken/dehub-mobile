import { useCallback, useEffect, useRef, useState } from 'react';

/** An interrupted exit animation must not leave an invisible native Modal. */
export function useSheetClosed(visible: boolean, exitDeadlineMs = 500) {
  const [closed, setClosed] = useState(!visible);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const finish = useCallback((next: boolean) => {
    // A callback queued by an earlier exit cannot hide a reopened sheet.
    if (next && visibleRef.current) return;
    setClosed(next);
  }, []);

  useEffect(() => {
    if (visible) {
      setClosed(false);
      return;
    }
    const timer = setTimeout(() => finish(true), exitDeadlineMs);
    return () => clearTimeout(timer);
  }, [visible, exitDeadlineMs, finish]);

  return [!visible && closed, finish] as const;
}
