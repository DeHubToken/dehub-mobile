import { useCallback, type DependencyList } from "react";
// Deep paths on purpose: the package root throws at import time when the new
// architecture is absent, which is every Jest run. Neither hook touches native
// code. Outside a FlashList the list context is undefined and both behave as
// plain state, so a card can use them in any list.
import { useRecyclingState } from "@shopify/flash-list/dist/recyclerview/hooks/useRecyclingState";

export { useRecyclingState };
export { useLayoutState } from "@shopify/flash-list/dist/recyclerview/hooks/useLayoutState";

/**
 * Per-post state that never changes the row's height: a tray, a play intent,
 * a counter behind a fixed-size icon.
 *
 * Resets to `initial` in the same render as any of `deps` changes, so a cell
 * handed to another post never paints the previous post's value. The setter
 * skips the list relayout that useRecyclingState's own setter asks for, since
 * nothing here moves the rows below it.
 */
export function useCellState<T>(
  initial: T | (() => T),
  deps: DependencyList,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, set] = useRecyclingState(initial, deps);
  const setNoLayout = useCallback((next: T | ((prev: T) => T)) => set(next, true), [set]);
  return [value, setNoLayout];
}
