import { useCallback, useEffect, useMemo, useRef } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/**
 * The post composer as a sheet that follows the finger (Android).
 *
 * The route is a transparentModal with no native animation, so the page it
 * opened from stays drawn underneath and this sheet does all the moving:
 * slides up on open, follows a downward drag from anywhere in its top part,
 * springs back when let go before half way, and slides away on every exit
 * (X, back, swipe, after Post) through one beforeRemove hook.
 *
 * iOS keeps its native modal sheet, which already does all of this.
 */
export const COMPOSER_SHEET = Platform.OS === "android";

/** Drags that start lower than this share of the screen are left alone
 *  (toolbar, keyboard edge). */
const GRAB_ZONE = 0.62;
const OPEN = { duration: 240, easing: Easing.out(Easing.cubic) };
const SHUT = { duration: 190, easing: Easing.in(Easing.quad) };
const SPRING = { damping: 24, stiffness: 320, mass: 0.7, overshootClamping: true };

type Options = {
  navigation: any;
  /** False while a Post is in flight: the sheet stays put. */
  enabled: boolean;
  /** Called once the drag is let go past half way. Runs the same path as the
   *  X, so drafts and the discard prompt still apply. */
  onDismiss: () => void;
  /** True when onDismiss will ask before leaving (discard prompt). */
  willPrompt: () => boolean;
};

export function useComposerSheet({ navigation, enabled, onDismiss, willPrompt }: Options) {
  const { height } = useWindowDimensions();
  const y = useSharedValue(COMPOSER_SHEET ? height : 0);
  const scrollY = useSharedValue(0);
  const holdDrag = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const leaving = useRef(false);
  const skipSlide = useRef(false);

  useEffect(() => {
    if (!COMPOSER_SHEET) return;
    y.value = withTiming(0, OPEN);
    // Mount-only: the sheet slides up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every way out slides the sheet down first, from wherever it is.
  useEffect(() => {
    if (!COMPOSER_SHEET) return;
    return navigation.addListener("beforeRemove", (e: any) => {
      if (leaving.current) return;
      leaving.current = true;
      if (skipSlide.current) return;
      e.preventDefault();
      Keyboard.dismiss();
      const action = e.data.action;
      const finish = () => navigation.dispatch(action);
      y.value = withTiming(height, SHUT, () => runOnJS(finish)());
    });
  }, [navigation, height, y]);

  /** Leave without the slide (the morph landing carries on from the sheet). */
  const leaveWithoutSlide = useCallback(() => {
    skipSlide.current = true;
  }, []);

  const release = useCallback(() => {
    if (willPrompt()) y.value = withSpring(0, SPRING);
    onDismiss();
  }, [onDismiss, willPrompt, y]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(COMPOSER_SHEET && enabled)
    .manualActivation(true)
    .onTouchesDown((e) => {
      const touch = e.allTouches[0];
      if (!touch) return;
      startX.value = touch.absoluteX;
      startY.value = touch.absoluteY;
    })
    .onTouchesMove((e, state) => {
      const touch = e.allTouches[0];
      if (!touch) return;
      const dx = touch.absoluteX - startX.value;
      const dy = touch.absoluteY - startY.value;
      if (holdDrag.value || scrollY.value > 1 || startY.value > height * GRAB_ZONE || e.allTouches.length > 1) {
        state.fail();
        return;
      }
      if (dy < -8 || (Math.abs(dx) > 14 && Math.abs(dx) > dy)) {
        state.fail();
        return;
      }
      if (dy > 12 && dy > Math.abs(dx) * 1.3) state.activate();
    })
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const far = y.value > height * 0.5;
      const flick = e.velocityY > 1600 && y.value > 60;
      if (far || flick) runOnJS(release)();
      else y.value = withSpring(0, { ...SPRING, velocity: e.velocityY });
    })
    .onFinalize((_e, success) => {
      if (!success && y.value > 0 && y.value < height) y.value = withSpring(0, SPRING);
    }), [enabled, height, release, y, scrollY, holdDrag, startX, startY]);

  /** Lets a scroll view inside the sheet run alongside the drag. */
  const scroll = useMemo(() => Gesture.Native(), []);
  const sheetPan = useMemo(() => pan.simultaneousWithExternalGesture(scroll), [pan, scroll]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - Math.min(1, y.value / height)) }));

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  }, [scrollY]);

  return { sheetPan, scroll, sheetStyle, dimStyle, onScroll, holdDrag, leaveWithoutSlide };
}
