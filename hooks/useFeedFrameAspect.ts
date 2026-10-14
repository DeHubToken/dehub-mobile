import { useEffect, useReducer, useRef } from 'react';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../libs/scrollActivity';

const displayed = new Map<string, number>();
function remember(key: string, ratio: number) {
  if (displayed.has(key)) return;
  displayed.set(key, ratio);
  if (displayed.size > 1000) displayed.delete(displayed.keys().next().value!);
}

/** Share the first visible frame between a recycled poster and its player. */
export function useFeedFrameAspect(key: string, candidate: number, visible: boolean, enabled = true, measured?: number | null): number {
  const valid = Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
  const frame = useRef({ key, ratio: displayed.get(key) ?? valid });
  if (frame.current.key !== key) frame.current = { key, ratio: displayed.get(key) ?? valid };
  const [, update] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!enabled || measured == null) return;
    return subscribeFeedSettled(update);
  }, [enabled, measured]);
  useEffect(() => {
    if (!enabled || displayed.has(key)) return;
    return subscribeFeedScrollStart(() => {
      if (frame.current.key === key) remember(key, frame.current.ratio);
    });
  }, [key, enabled]);
  if (!enabled) return valid;
  // A placeholder is not a measured video frame. Correct it when dimensions
  // arrive, after a fling settles, and share that shape with recycled rows.
  if (measured != null && Number.isFinite(measured) && measured > 0 && !isFeedScrolling()) {
    frame.current.ratio = measured;
    displayed.delete(key);
    remember(key, measured);
  }
  if (!displayed.has(key)) {
    // Playback viewability starts at 50%, after a card has already entered.
    // A moving feed must hold the frame even before that playback threshold.
    if (!isFeedScrolling()) frame.current.ratio = valid;
    if (visible || isFeedScrolling()) remember(key, frame.current.ratio);
  }
  return displayed.get(key) ?? frame.current.ratio;
}
