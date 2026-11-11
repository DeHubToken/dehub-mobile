import { useContext, useEffect, useRef } from "react";
import type { View } from "react-native";
import { NavigationContext } from "@react-navigation/core";
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

/**
 * Every page shares the home feed's top pill. When the page changes, the new
 * page's pill starts where the old one was and glides to its own spot (up from
 * under the home header, back down on the way home), and its contents fade up
 * inside it, so it reads as one pill moving. Same timing as web.
 */
const GLIDE = { duration: 460, easing: Easing.bezier(0.16, 1, 0.3, 1) } as const;
const FADE = { duration: 300, easing: Easing.bezier(0, 0, 0.58, 1) } as const;

/** Where the last pill that lost focus sat on screen, and when. */
let lastTop: number | null = null;
let lastAt = 0;

export function usePillGlide(fadeContents = true) {
  const ref = useRef<View>(null);
  const reducedMotion = useReducedMotion();
  const shift = useSharedValue(0);
  const fade = useSharedValue(1);
  const lift = useSharedValue(0);

  // Read from context rather than useFocusEffect, so a pill drawn outside a
  // navigator (tests, previews) simply does not glide.
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation) return;
    let raf = 0;
    const onFocus = () => {
      // The page losing focus notes its spot as it blurs, which can land a
      // moment after this runs, so read on the next frame.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const from = lastTop;
        const fresh = from != null && Date.now() - lastAt < 1200;
        lastTop = null;
        if (!fresh || reducedMotion) return;
        ref.current?.measureInWindow((_x, y) => {
          if (!Number.isFinite(y) || y <= 0) return;
          const dy = (from as number) - y;
          if (!Number.isFinite(dy) || Math.abs(dy) >= 160) return;
          // Pills already in the same spot (page to page) don't move; their
          // contents still fade up, so every switch reads as the one pill
          // changing what it shows, same as web.
          if (Math.abs(dy) > 1) {
            shift.value = dy;
            shift.value = withTiming(0, GLIDE);
          }
          if (fadeContents) {
            fade.value = 0;
            lift.value = 4;
            fade.value = withDelay(80, withTiming(1, FADE));
            lift.value = withDelay(80, withTiming(0, FADE));
          }
        });
      });
    };
    const onBlur = () => {
      cancelAnimationFrame(raf);
      ref.current?.measureInWindow((_x, y) => {
        // A view already taken off screen measures as all zeros.
        if (!Number.isFinite(y) || y <= 0) return;
        lastTop = y;
        lastAt = Date.now();
      });
    };
    // A page opened for the first time mounts already focused.
    if (navigation.isFocused()) onFocus();
    const offFocus = navigation.addListener("focus", onFocus);
    const offBlur = navigation.addListener("blur", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      offFocus();
      offBlur();
    };
  }, [navigation, reducedMotion, fadeContents, shift, fade, lift]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: shift.value }] }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: lift.value }],
  }));
  return { ref, pillStyle, contentStyle };
}
