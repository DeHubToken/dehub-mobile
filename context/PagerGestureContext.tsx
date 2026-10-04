import React, { createContext, useContext, useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import type { GestureType } from "react-native-gesture-handler";
import { HomePullRefreshContext } from "./HomePullRefreshContext";

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
 * is no pager above it.
 */
export const useHorizontalScrollGuard = () => {
  const pagerRef = useContext(PagerGestureContext);
  const homePull = useContext(HomePullRefreshContext);
  const pullRef = homePull?.enabled ? homePull.gestureRef : undefined;
  return useMemo(
    () => {
      if (!pagerRef) return null;
      const guard = Gesture.Native().blocksExternalGesture(pagerRef);
      // The child keeps horizontal drags without cancelling the feed's
      // direction-checked downward pull at the top of the active page.
      return pullRef ? guard.simultaneousWithExternalGesture(pullRef) : guard;
    },
    [pagerRef, pullRef],
  );
};

/**
 * The pager's own gesture ref, or null outside a pager. For children that are
 * not scroll views — a scrubber, a slider — and so need to build their own
 * gesture with `blocksExternalGesture(pagerRef)`.
 */
export const usePagerGestureRef = () => useContext(PagerGestureContext);
