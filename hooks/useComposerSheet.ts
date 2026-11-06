import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { MOTION, SNAP_SPRING } from "../theme/motion";

/**
 * The post composer as a sheet that follows the finger (Android).
 *
 * The route is a transparentModal with no native animation, so the page it
 * opened from stays drawn underneath and this sheet does all the moving:
 * slides up on open, follows a downward drag from anywhere in its top part,
 * and slides away on every exit (X, back, swipe, after Post) through one
 * beforeRemove hook.
 *
 * Letting go decides from the finger, not from where the sheet happens to be:
 * still moving down closes it, in one motion that carries on at the finger's
 * speed. It only springs back when the finger stopped (or turned up) short of
 * half way.
 *
 * iOS keeps its native modal sheet, which already does all of this.
 */
export const COMPOSER_SHEET = Platform.OS === "android";

/** Drags that start lower than this share of the screen are left alone
 *  (toolbar, keyboard edge). */
const GRAB_ZONE = 0.62;
const OPEN = { duration: MOTION.open - 40, easing: Easing.out(Easing.cubic) };
const SHUT = { duration: MOTION.close, easing: Easing.in(Easing.cubic) };
const SPRING = { ...SNAP_SPRING, overshootClamping: true };
/** px/s downward at release that still counts as moving. */
const MOVING = 250;
/** How far ahead the release speed is carried when judging distance (s). */
const PROJECT_S = 0.18;
/** Fastest the slide-out starts, so a lazy release still leaves briskly (px/s). */
const MIN_EXIT_SPEED = 1800;
/** If nothing navigates after a drag-close (a failed draft save), come back. */
const EXIT_SAFETY_MS = 2500;

type Options = {
  navigation: any;
  /** False while a Post is in flight: the sheet stays put. */
  enabled: boolean;
  /** Called once the drag is let go past half way. Runs the same path as the
   *  X, so drafts and the discard prompt still apply. */
  onDismiss: () => void;
  /** True when onDismiss will ask before leaving (discard prompt). */
  willPrompt: () => boolean;
  /** A drag has started: put the keyboard away. Left up, Android pans the
   *  whole app to keep the field above the keys once the sheet is pulled
   *  below them, and the sheet stops following the finger. Returns whether
   *  the keyboard was up. */
  onDragStart: () => boolean;
  /** The sheet sprang back after a drag that began with the keyboard up. */
  onSettleOpen: () => void;
  /** False keeps this screen a plain page (no slide, no drag). Read once at
   *  mount. Defaults to the Android sheet. */
  active?: boolean;
  /** Share of the screen, from the top, where a pull can start the drag. */
  grabZone?: number;
};

export function useComposerSheet({ navigation, enabled, onDismiss, willPrompt, onDragStart, onSettleOpen, active: activeOpt, grabZone = GRAB_ZONE }: Options) {
  const { height } = useWindowDimensions();
  const [active] = useState(COMPOSER_SHEET && (activeOpt ?? true));
  const y = useSharedValue(active ? height : 0);
  const scrollY = useSharedValue(0);
  const holdDrag = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const leaving = useRef(false);
  const skipSlide = useRef(false);
  const hadKeyboard = useRef(false);
  /** A drag-close slid the sheet away on the UI thread; beforeRemove waits for it. */
  const dragExit = useRef<"none" | "running" | "done">("none");
  const pendingExit = useRef<(() => void) | null>(null);
  const exitSafety = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors willPrompt() for the UI thread: a discard prompt keeps the sheet up. */
  const prompts = useSharedValue(false);
  useEffect(() => {
    prompts.value = willPrompt();
  });
  useEffect(() => () => {
    if (exitSafety.current) clearTimeout(exitSafety.current);
  }, []);
  // Everything the first frame does not need (the closed sheets and drawers
  // the composer can open) mounts once the sheet is up, so the slide starts
  // as soon as possible after the tap.
  const [extrasReady, setExtrasReady] = useState(!active);

  // Layout effect: starts the slide before the screen's other effects run.
  useLayoutEffect(() => {
    if (!active) return;
    y.value = withTiming(0, OPEN);
    const timer = setTimeout(() => startTransition(() => setExtrasReady(true)), OPEN.duration + 60);
    return () => clearTimeout(timer);
    // Mount-only: the sheet slides up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every way out slides the sheet down first, from wherever it is.
  useEffect(() => {
    if (!active) return;
    return navigation.addListener("beforeRemove", (e: any) => {
      if (leaving.current) return;
      leaving.current = true;
      if (skipSlide.current) return;
      // A drag-close already took the sheet off screen (or is doing so):
      // leave once it is gone instead of starting a second slide.
      if (dragExit.current === "done") return;
      e.preventDefault();
      Keyboard.dismiss();
      const action = e.data.action;
      const finish = () => navigation.dispatch(action);
      if (dragExit.current === "running") {
        pendingExit.current = finish;
        return;
      }
      y.value = withTiming(height, SHUT, () => runOnJS(finish)());
    });
  }, [active, navigation, height, y]);

  /** Leave without the slide (the morph landing carries on from the sheet). */
  const leaveWithoutSlide = useCallback(() => {
    skipSlide.current = true;
  }, []);

  const release = useCallback(() => {
    if (willPrompt()) y.value = withSpring(0, SPRING);
    onDismiss();
  }, [onDismiss, willPrompt, y]);
  /** Drag-close: the slide is already running on the UI thread. */
  const releaseSliding = useCallback(() => {
    dragExit.current = "running";
    onDismiss();
  }, [onDismiss]);
  const slideDone = useCallback(() => {
    if (dragExit.current !== "running") return;
    dragExit.current = "done";
    const go = pendingExit.current;
    pendingExit.current = null;
    if (go) {
      go();
      return;
    }
    exitSafety.current = setTimeout(() => {
      if (leaving.current) return;
      dragExit.current = "none";
      y.value = withSpring(0, SPRING);
    }, EXIT_SAFETY_MS);
  }, [y]);
  const dragStarted = useCallback(() => {
    hadKeyboard.current = onDragStart();
  }, [onDragStart]);
  const settledOpen = useCallback(() => {
    if (hadKeyboard.current) onSettleOpen();
    hadKeyboard.current = false;
  }, [onSettleOpen]);

  // The gesture must not be rebuilt while a finger is on it: RNGH cancels a
  // running drag when its gesture object changes, and the sheet sprang back
  // half way. Drag start puts the keyboard away, which resizes the window
  // (adjustResize) and re-renders the screen, so the gesture reads the height
  // and every callback through stable handles.
  const H = useSharedValue(height);
  useEffect(() => {
    H.value = height;
  }, [height, H]);
  const latest = useRef({ release, releaseSliding, slideDone, dragStarted, settledOpen });
  latest.current = { release, releaseSliding, slideDone, dragStarted, settledOpen };
  const releaseJS = useCallback(() => latest.current.release(), []);
  const releaseSlidingJS = useCallback(() => latest.current.releaseSliding(), []);
  const slideDoneJS = useCallback(() => latest.current.slideDone(), []);
  const dragStartedJS = useCallback(() => latest.current.dragStarted(), []);
  const settledOpenJS = useCallback(() => latest.current.settledOpen(), []);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(active && enabled)
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
      if (holdDrag.value || scrollY.value > 1 || startY.value > H.value * grabZone || e.allTouches.length > 1) {
        state.fail();
        return;
      }
      if (dy < -8 || (Math.abs(dx) > 14 && Math.abs(dx) > dy)) {
        state.fail();
        return;
      }
      if (dy > 12 && dy > Math.abs(dx) * 1.3) state.activate();
    })
    .onStart(() => {
      runOnJS(dragStartedJS)();
    })
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const v = e.velocityY;
      const at = y.value;
      const moving = v > MOVING && at > 24;
      const far = at + Math.max(0, v) * PROJECT_S > H.value * 0.5 && v > -MOVING;
      if ((moving || far) && !prompts.value) {
        // Carry on at the finger's speed: an ease-out starts at twice its
        // average speed, so this duration makes the first frame match.
        const left = Math.max(1, H.value - at);
        const speed = Math.max(v, MIN_EXIT_SPEED);
        const duration = Math.min(320, Math.max(140, (2 * left / speed) * 1000));
        y.value = withTiming(H.value, { duration, easing: Easing.out(Easing.quad) }, (done) => {
          if (done) runOnJS(slideDoneJS)();
        });
        runOnJS(releaseSlidingJS)();
      } else if (moving || far) runOnJS(releaseJS)();
      else {
        y.value = withSpring(0, { ...SPRING, velocity: e.velocityY });
        runOnJS(settledOpenJS)();
      }
    })
    .onFinalize((_e, success) => {
      if (!success && y.value > 0 && y.value < H.value) y.value = withSpring(0, SPRING);
    }), [active, enabled, grabZone, H, y, scrollY, holdDrag, startX, startY, prompts, releaseJS, releaseSlidingJS, slideDoneJS, dragStartedJS, settledOpenJS]);

  /** Lets the scroll view inside the sheet run alongside the drag. */
  const scroll = useMemo(() => Gesture.Native(), []);
  /** Same for the text box: a native field grabs the touch on its own and a
   *  pull starting on the text line never reached the sheet. It also runs
   *  alongside the scroll view: the field takes the touch the moment a finger
   *  lands on it, so without this a long post could not be scrolled by
   *  dragging on its text. */
  const text = useMemo(() => Gesture.Native().simultaneousWithExternalGesture(scroll), [scroll]);
  const sheetPan = useMemo(() => pan.simultaneousWithExternalGesture(scroll, text), [pan, scroll, text]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - Math.min(1, y.value / height)) }));

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  }, [scrollY]);

  return { sheetPan, scroll, text, sheetStyle, dimStyle, onScroll, holdDrag, leaveWithoutSlide, extrasReady };
}
