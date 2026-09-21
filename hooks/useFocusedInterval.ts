import { useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { NavigationContext } from "@react-navigation/native";

/**
 * Whether the nearest screen is focused. Outside any navigator — a host
 * mounted beside the navigation tree — there is no screen to be blurred, so
 * the answer is always true rather than a thrown "no navigation object".
 */
export function useIsScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) {
      setFocused(true);
      return;
    }
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return focused;
}

interface Options {
  /**
   * Run the callback at once whenever ticking resumes — the screen regaining
   * focus, the app returning to the foreground — so a poller catches up the
   * moment it is looked at again instead of one full interval later. Never
   * fires on the first mount, where callers already make their initial call.
   */
  catchUp?: boolean;
}

/**
 * setInterval that ticks only while this screen is focused and the app is in
 * the foreground.
 *
 * Every screen navigated away from stays mounted in the native stack, and
 * `freezeOnBlur` suspends its rendering, not its effects. A plain setInterval
 * in a screen therefore keeps hitting the network and the JS thread for as
 * long as that screen sits anywhere in the stack behind the one being looked
 * at — the wallet's 10s supply poll, a profile's 30s earnings poll, a market
 * grid's three 30s queries, all running under the home feed. This is where a
 * good share of "the app feels busy for no reason" came from.
 *
 * `ms` of null pauses the interval; `callback` is read through a ref so a new
 * identity never restarts the clock.
 */
export function useFocusedInterval(
  callback: () => void,
  ms: number | null,
  { catchUp = false }: Options = {},
): void {
  const isFocused = useIsScreenFocused();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  // False until the first interval has started, so a catch-up only ever runs
  // for a genuine resume.
  const startedOnceRef = useRef(false);

  useEffect(() => {
    if (ms == null || !isFocused) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      if (catchUp && startedOnceRef.current) callbackRef.current();
      startedOnceRef.current = true;
      timer = setInterval(() => callbackRef.current(), ms);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    // `inactive` is the notification shade or a system dialog, not a real
    // departure — same call the query client makes. Only `background` stops
    // the clock.
    if (AppState.currentState !== "background") start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else if (state === "background") stop();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [ms, isFocused, catchUp]);
}

export default useFocusedInterval;
