import { useRef } from 'react';

const displayed = new Map<string, number>();

/** Share the first visible frame between a recycled poster and its player. */
export function useFeedFrameAspect(key: string, candidate: number, visible: boolean, enabled = true): number {
  const valid = Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
  const frame = useRef({ key, ratio: displayed.get(key) ?? valid });
  if (frame.current.key !== key) frame.current = { key, ratio: displayed.get(key) ?? valid };
  if (!enabled) return valid;
  if (!displayed.has(key)) {
    frame.current.ratio = valid;
    if (visible) {
      displayed.set(key, valid);
      if (displayed.size > 1000) displayed.delete(displayed.keys().next().value!);
    }
  }
  return displayed.get(key) ?? frame.current.ratio;
}
