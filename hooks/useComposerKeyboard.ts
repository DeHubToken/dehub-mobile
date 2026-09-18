import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Platform, View, useWindowDimensions, type KeyboardEvent } from "react-native";
import { keyboardComposerLift } from "../libs/keyboard-composer";

/** Measure the composer itself: Android can resize its parent without resizing Dimensions. */
export function useComposerKeyboard(viewportHeight: number) {
  const ref = useRef<View>(null);
  const [lift, setLift] = useState(0);
  const liftRef = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const measurement = useRef(0);
  const { width, height } = useWindowDimensions();
  useLayoutEffect(() => { liftRef.current = lift; }, [lift]);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top == null) return;
    const request = ++measurement.current;
    const appliedLift = liftRef.current;
    ref.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      if (request !== measurement.current || keyboardTop.current !== top) return;
      const next = keyboardComposerLift(y + measuredHeight, appliedLift, top);
      if (Math.abs(next - liftRef.current) < 1) return;
      setLift(next);
    });
  }, []);

  useEffect(() => {
    const show = (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      measure();
    };
    const hide = () => {
      keyboardTop.current = null;
      measurement.current++;
      liftRef.current = 0;
      setLift(0);
    };
    const shown = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", show);
    const hidden = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", hide);
    return () => {
      measurement.current++;
      shown.remove();
      hidden.remove();
    };
  }, [measure]);

  useEffect(() => { measure(); }, [width, height, viewportHeight, measure]);

  return { ref, lift, onLayout: measure };
}
