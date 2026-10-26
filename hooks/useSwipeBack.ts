import { createContext, useContext, useEffect, useRef } from 'react';

export type BackAction = () => void;
export type RegisterBackAction = (action: BackAction) => () => void;
export const SwipeBackActions = createContext<RegisterBackAction | null>(null);

/** Keep the swipe tied to the same guarded/local action as the visible arrow. */
export function useSwipeBackAction(action: BackAction | undefined, enabled = true) {
  const register = useContext(SwipeBackActions);
  const latest = useRef(action);
  latest.current = action;
  const hasAction = !!action;
  useEffect(() => {
    if (!register || !enabled || !hasAction) return;
    return register(() => latest.current?.());
  }, [register, enabled, hasAction]);
}

export type ClaimEdgeSwipe = () => () => void;
export const SwipeBackEdgeOwner = createContext<ClaimEdgeSwipe | null>(null);

/**
 * For a screen that draws its own interactive edge back (the page following
 * the finger). The screen-wide release-to-go-back pan stands down while it is
 * mounted, so the two never race for the same drag off the edge.
 */
export function useOwnEdgeSwipe(enabled = true) {
  const claim = useContext(SwipeBackEdgeOwner);
  useEffect(() => {
    if (!claim || !enabled) return;
    return claim();
  }, [claim, enabled]);
}
