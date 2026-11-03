import { useEffect } from "react";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";
import { Easing, useAnimatedKeyboard, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

/**
 * useKeyboardLift (hooks/useKeyboardLayout.ts) as a shared value, for a
 * bottom bar that has to ride up with the keys.
 *
 * As React state, every keyboard event re-rendered the whole screen and the
 * bar jumped to its new place in one frame while the keys were still
 * sliding. Here nothing re-renders: the value eases to the keyboard's height
 * on the UI thread, on the same curve and about the same time as the keys.
 *
 * Android follows the keys frame by frame (Reanimated reads the IME insets
 * while they animate). RN's keyboardDidShow only arrives as the keys finish
 * (~250ms after they start on a Galaxy S24+), so a bar driven by it sat
 * under the rising keys and then popped up. With edge-to-edge the inset is
 * measured from the screen's bottom, so the nav bar under the screen's own
 * bottom edge comes off.
 */
const ANDROID_KEYS = { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1) };

function useAndroidLift(bottomInset: number): SharedValue<number> {
  const keyboard = useAnimatedKeyboard();
  return useDerivedValue(() => Math.max(0, keyboard.height.value - bottomInset), [bottomInset]);
}

export const useKeyboardLiftValue = Platform.OS === "android" ? useAndroidLift : useEventLift;

function useEventLift(bottomInset: number): SharedValue<number> {
  const lift = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      const target = ios ? Math.max(h - bottomInset, 0) : h;
      lift.value = ios
        ? withTiming(target, { duration: e.duration || 250, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77) })
        : withTiming(target, ANDROID_KEYS);
    };
    const onHide = (e?: KeyboardEvent) => {
      lift.value = ios
        ? withTiming(0, { duration: e?.duration || 250, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77) })
        : withTiming(0, ANDROID_KEYS);
    };
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", onShow);
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", onHide);
    if (Keyboard.isVisible()) {
      const m = Keyboard.metrics();
      if (m) lift.value = ios ? Math.max(m.height - bottomInset, 0) : m.height;
    }
    return () => { show.remove(); hide.remove(); };
  }, [bottomInset, lift]);
  return lift;
}
