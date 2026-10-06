import { useEffect, useState } from "react";
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from "../libs/scrollActivity";

/** Allocate playback resources only after the same autoplay candidate has dwelled. */
export function useSettledAutoplay(eligible: boolean, mediaKey: string | undefined, delay: number, waitForFeedSettle = false) {
  const [settledKey, setSettledKey] = useState<string | null>(null);

  useEffect(() => {
    setSettledKey(null);
    if (!eligible || !mediaKey) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      cancel();
      if (settled || (waitForFeedSettle && isFeedScrolling())) return;
      timer = setTimeout(() => {
        timer = null;
        if (waitForFeedSettle && isFeedScrolling()) return;
        settled = true;
        setSettledKey(mediaKey);
      }, delay);
    };
    // Only pending starts are deferred. An already-playing clip keeps its player
    // while visible; a drag never remounts it or updates every feed row.
    const unsubscribeStart = waitForFeedSettle ? subscribeFeedScrollStart(cancel) : undefined;
    const unsubscribeSettled = waitForFeedSettle ? subscribeFeedSettled(schedule) : undefined;
    schedule();
    return () => {
      cancel();
      unsubscribeStart?.();
      unsubscribeSettled?.();
    };
  }, [eligible, mediaKey, delay, waitForFeedSettle]);

  return eligible && !!mediaKey && settledKey === mediaKey;
}
