import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Platform, View, useWindowDimensions, type KeyboardEvent } from "react-native";
import { keyboardComposerLift } from "../libs/keyboard-composer";

type ComposerKeyboardOptions = {
  /** Space left between the composer and the top of the keys. */
  gap?: number;
  /** Offset the caller applies while the keyboard is down (e.g. a tab bar). */
  restingOffset?: number;
  /** Off for surfaces whose parent already sits above the keyboard. */
  enabled?: boolean;
};

/*
 * Android reports no event when the window settles after the keyboard opens
 * (a late resize, the nav bar changing height, the keys finishing their
 * slide), so measure again a few times after the first one.
 */
const SETTLE_MS = [120, 350, 700];

/**
 * Measure the composer itself and lift it until its bottom sits on the
 * keyboard. Deriving the lift from the keyboard height and the safe-area
 * insets depends on the device: whether the window resizes, how tall the
 * nav bar is while typing, and which window the composer lives in all
 * differ, and each mismatch left the box under the keys on some phones.
 * Comparing the composer's real position with the keyboard's top works the
 * same everywhere.
 */
export function useComposerKeyboard(viewportHeight: number = 0, options: ComposerKeyboardOptions = {}) {
  const { gap = 8, restingOffset = 0, enabled = true } = options;
  const ref = useRef<View>(null);
  const [state, setState] = useState({ visible: false, lift: 0 });
  const applied = useRef(restingOffset);
  const keyboardTop = useRef<number | null>(null);
  const fallback = useRef(0);
  const measurement = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settings = useRef({ gap, restingOffset });
  settings.current = { gap, restingOffset };
  const { width, height } = useWindowDimensions();
  useLayoutEffect(() => {
    applied.current = state.visible ? state.lift : restingOffset;
  }, [state, restingOffset]);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top == null) return;
    const request = ++measurement.current;
    const appliedLift = applied.current;
    const node = ref.current;
    const applyFallback = () => setState({ visible: true, lift: fallback.current });
    if (!node?.measureInWindow) {
      applyFallback();
      return;
    }
    node.measureInWindow((_x, y, _width, measuredHeight) => {
      if (request !== measurement.current || keyboardTop.current !== top) return;
      if (!measuredHeight) {
        applyFallback();
        return;
      }
      const next = keyboardComposerLift(y + measuredHeight, appliedLift, top, settings.current.gap);
      setState((prev) =>
        prev.visible && Math.abs(next - prev.lift) < 1 ? prev : { visible: true, lift: next },
      );
    });
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (!enabled) return;
    const show = (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      // Only used when the composer cannot be measured.
      fallback.current = Math.max(event.endCoordinates.height ?? 0, 0);
      measure();
      clearTimers();
      timers.current = SETTLE_MS.map((ms) => setTimeout(measure, ms));
    };
    const hide = () => {
      keyboardTop.current = null;
      measurement.current++;
      clearTimers();
      applied.current = settings.current.restingOffset;
      setState({ visible: false, lift: 0 });
    };
    const shown = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", show);
    const hidden = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", hide);
    return () => {
      measurement.current++;
      clearTimers();
      shown.remove();
      hidden.remove();
      keyboardTop.current = null;
      setState({ visible: false, lift: 0 });
    };
  }, [measure, enabled]);

  useEffect(() => { measure(); }, [width, height, viewportHeight, measure]);

  return { ref, lift: state.lift, isVisible: state.visible, onLayout: measure };
}
