import { createContext, useCallback, useMemo, useRef } from 'react';
import type { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { measure, runOnJS, useAnimatedRef, useSharedValue } from 'react-native-reanimated';
import { usePagerGestureRef } from '../context/PagerGestureContext';

export const SCRUB_HIT_HEIGHT = 64;
export const SCRUB_BELOW_SLOP = 24;

type ScrubCallbacks = {
  start: () => void;
  preview: (ratio: number) => void;
  commit: (ratio: number) => void;
  cancel: () => void;
};

/** Own the small area below a clipped player without moving its native views. */
export function useFeedScrubBoundary() {
  const trackRef = useAnimatedRef<View>();
  const enabled = useSharedValue(false);
  const claimed = useSharedValue(false);
  const bounds = useSharedValue({ left: 0, width: 1 });
  const callbacks = useRef<ScrubCallbacks | null>(null);
  const pager = usePagerGestureRef();
  const register = useCallback((value: ScrubCallbacks) => {
    callbacks.current = value;
    enabled.value = true;
    return () => {
      if (callbacks.current !== value) return;
      callbacks.current = null;
      enabled.value = false;
      claimed.value = false;
    };
  }, [enabled, claimed]);
  const start = useCallback((ratio: number) => {
    callbacks.current?.start();
    callbacks.current?.preview(ratio);
  }, []);
  const preview = useCallback((ratio: number) => callbacks.current?.preview(ratio), []);
  const commit = useCallback((ratio: number) => callbacks.current?.commit(ratio), []);
  const cancel = useCallback(() => callbacks.current?.cancel(), []);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().manualActivation(true).maxPointers(1).shouldCancelWhenOutside(false)
      .onTouchesDown((event, manager) => {
        // A new touch outside the track restores deliberate post/profile taps.
        claimed.value = false;
        const point = event.allTouches[0];
        const box = enabled.value ? measure(trackRef) : null;
        if (!box || !point || event.numberOfTouches !== 1) { manager.fail(); return; }
        const bottom = box.pageY + box.height;
        if (point.absoluteX < box.pageX || point.absoluteX > box.pageX + box.width
          || point.absoluteY < bottom - SCRUB_HIT_HEIGHT || point.absoluteY > bottom + SCRUB_BELOW_SLOP) {
          manager.fail(); return;
        }
        claimed.value = true;
        // Inside the player, the existing strip owns its buttons and scrub pan.
        if (point.absoluteY < bottom) { manager.fail(); return; }
        bounds.value = { left: box.pageX, width: Math.max(1, box.width) };
        manager.activate();
      })
      .onStart(event => {
        runOnJS(start)(Math.max(0, Math.min(1, (event.absoluteX - bounds.value.left) / bounds.value.width)));
      })
      .onUpdate(event => {
        runOnJS(preview)(Math.max(0, Math.min(1, (event.absoluteX - bounds.value.left) / bounds.value.width)));
      })
      .onEnd((event, success) => {
        if (success) runOnJS(commit)(Math.max(0, Math.min(1, (event.absoluteX - bounds.value.left) / bounds.value.width)));
        else runOnJS(cancel)();
        // Keep claimed through any delayed press callback; clear on next down.
      });
    if (pager) pan.blocksExternalGesture(pager);
    return pan;
  }, [bounds, claimed, enabled, pager, trackRef, start, preview, commit, cancel]);
  const controller = useMemo(() => ({ trackRef, register, claimed }), [trackRef, register, claimed]);
  return { gesture, controller, claimed };
}

export const FeedScrubContext = createContext<ReturnType<typeof useFeedScrubBoundary>['controller'] | null>(null);
