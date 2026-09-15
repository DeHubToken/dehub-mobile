import { useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * `useState` for a list cell that gets recycled.
 *
 * A recycling list (FlashList) hands an existing card a different `item`
 * instead of mounting a new card, so plain `useState` would carry the
 * previous post's flags — its open menu, its "see more", its unlocked PPV —
 * onto the next one. This resets to `initial` whenever `key` changes, in the
 * same render, so the recycled card never commits the old post's state.
 *
 * Works outside a recycling list too (the key simply never changes), so a
 * card can use it whether it sits in the home feed or in a plain FlatList.
 */
export function useItemState<T>(
  initial: T | (() => T),
  key: unknown,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const keyRef = useRef(key);
  if (keyRef.current !== key) {
    keyRef.current = key;
    // Setting state during render of the same component is the sanctioned
    // way to derive state from a prop change: React re-runs this render
    // before committing, so the stale value never reaches the screen.
    setState(typeof initial === "function" ? (initial as () => T)() : initial);
  }
  return [state, setState];
}
