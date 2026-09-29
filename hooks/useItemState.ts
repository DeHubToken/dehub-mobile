import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

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

/**
 * Per-post state written after an await or a deferred callback.
 *
 * Each write carries the key it was made under, and any other key reads
 * `fallback`. So a recycled cell never shows the previous post's value, and a
 * write that lands late for that post (a save resolving, a sign-in finishing)
 * cannot open or change anything on the next one: the setter a handler
 * captured at tap time still writes under the old key. There is no reset
 * render and no effect.
 *
 * `fallback` must be a primitive or a module constant, because the setter
 * changes identity with it.
 */
export function useKeyedState<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [box, setBox] = useState<{ key: string; value: T } | null>(null);
  const value = box !== null && box.key === key ? box.value : fallback;
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setBox((prev) => {
        const current = prev !== null && prev.key === key ? prev.value : fallback;
        const v = typeof next === "function" ? (next as (p: T) => T)(current) : next;
        // Nothing this key reads would change, so keep the box and skip the render.
        return Object.is(v, current) ? prev : { key, value: v };
      }),
    [key, fallback],
  );
  return [value, set];
}
