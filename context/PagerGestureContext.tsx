import React, { createContext, useContext, useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import type { GestureType } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

/**
 * Lets a horizontally-scrolling view deep inside a swipe pager keep its own
 * swipes.
 *
 * A pager's pan gesture is an ancestor of everything on the page, so once it
 * clears its activation threshold it cancels whatever native scroll the finger
 * was actually on — drag a post's image gallery and the page turns instead.
 * Registering every such child with the pager by ref does not scale (there is
 * one gallery per feed card), so the relation is declared from the child side:
 * the pager publishes its gesture ref here, and children wrap themselves in the
 * native gesture returned by `useHorizontalScrollGuard`, which blocks the pager
 * for as long as the child scroll is running.
 *
 * Outside a pager the hook returns null and callers render their scroll view
 * bare — nothing to arbitrate with.
 */
const PagerGestureContext = createContext<React.MutableRefObject<GestureType | undefined> | null>(
  null,
);

export const PagerGestureProvider: React.FC<{
  gestureRef: React.MutableRefObject<GestureType | undefined>;
  children: React.ReactNode;
}> = ({ gestureRef, children }) => (
  <PagerGestureContext.Provider value={gestureRef}>{children}</PagerGestureContext.Provider>
);

/**
 * Native gesture to wrap a horizontally-scrolling child in, or null when there
 * is no pager above it. Android button strips can activate on touch-down so
 * the pager cannot take over before their native scroll recognizer starts.
 */
export const useHorizontalScrollGuard = (activateOnStart = false) => {
  const pagerRef = useContext(PagerGestureContext);
  return useMemo(
    () => (pagerRef ? Gesture.Native().shouldActivateOnStart(activateOnStart).blocksExternalGesture(pagerRef) : null),
    [pagerRef, activateOnStart],
  );
};

/** Keep a carousel's heading and padding inside its horizontal gesture area. */
export const useHorizontalSectionGuard = (scrollGuard: ReturnType<typeof useHorizontalScrollGuard>) => {
  const pagerRef = useContext(PagerGestureContext);
  const touch = useSharedValue({ x: 0, y: 0, decided: false });
  return useMemo(() => {
    if (!pagerRef || !scrollGuard) return null;
    return Gesture.Pan()
      .manualActivation(true)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(pagerRef)
      .simultaneousWithExternalGesture(scrollGuard)
      .onTouchesDown((event, manager) => {
        const point = event.allTouches[0];
        if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
        touch.value = { x: point.absoluteX, y: point.absoluteY, decided: false };
      })
      .onTouchesMove((event, manager) => {
        const origin = touch.value;
        if (origin.decided) return;
        const point = event.allTouches[0];
        if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
        const dx = Math.abs(point.absoluteX - origin.x);
        const dy = Math.abs(point.absoluteY - origin.y);
        if (Math.max(dx, dy) <= 6) return;
        touch.value = { ...origin, decided: true };
        // Decide by direction even when a fast first event crosses both axes.
        // The native list scrolls simultaneously; vertical drags stay with the feed.
        if (dx > dy) manager.activate();
        else manager.fail();
      });
  }, [pagerRef, scrollGuard, touch]);
};

/**
 * The pager's own gesture ref, or null outside a pager. For children that are
 * not scroll views — a scrubber, a slider — and so need to build their own
 * gesture with `blocksExternalGesture(pagerRef)`.
 */
export const usePagerGestureRef = () => useContext(PagerGestureContext);
