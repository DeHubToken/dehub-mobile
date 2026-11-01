import React, { useContext, useEffect, useRef } from "react";
import { Animated, Dimensions, Keyboard, Platform, StatusBar, StyleSheet, TextInput, type KeyboardEvent, type View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { initialSafeAreaMetrics } from "../../libs/initialSafeAreaMetrics";
import { keyboardTopFromEvent } from "../../libs/keyboard-composer";
import { selfLiftingComposers } from "../../hooks/useComposerKeyboard";

/** Resolves true when `input` is drawn inside `ancestor`. */
function isInside(input: any, ancestor: any): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ancestor) return resolve(false);
    try {
      input.measureLayout(ancestor, () => resolve(true), () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/** Space kept between the focused field and the keys. */
const CLEARANCE = 12;
/* Re-check while the keyboard is up: Android sends no event when the window
   settles late, when focus moves to another field, or when a field grows. */
const SETTLE_MS = [120, 350, 700];
const POLL_MS = 500;

/**
 * Last line of defence for "the keyboard hides what I'm typing".
 *
 * Composers that know they sit at the bottom lift themselves
 * (hooks/useComposerKeyboard). Every other field in the app (forms, settings,
 * search boxes low on a page, anything added later) relied on the window
 * shrinking for the keyboard, which edge-to-edge Android no longer does. While
 * the keyboard is up this measures the focused field and, only if the keys
 * cover it, slides the whole screen up until it clears them, the way Android's
 * adjustPan did. A field that is already visible moves nothing.
 *
 * Fields inside a native Modal live in another window this view cannot move;
 * `measureLayout` against this view fails for them and they are left alone.
 */
export default function KeyboardPanView({ children }: { children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const pan = useRef(new Animated.Value(0)).current;
  const applied = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const insets = useContext(SafeAreaInsetsContext);
  const navBar = useRef(0);
  // The provider's inset can read 0 on some screens while the real nav bar is
  // there; the launch-time inset is the nav bar's own height, so never use less.
  navBar.current = Math.max(insets?.bottom ?? 0, initialSafeAreaMetrics.insets.bottom ?? 0);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let poll: ReturnType<typeof setInterval> | null = null;
    let request = 0;

    const moveTo = (value: number) => {
      if (Math.abs(value - applied.current) < 1) return;
      applied.current = value;
      // Instant: an animated pan would be half-way through when the next
      // check measures, and it would chase its own tail.
      pan.setValue(-value);
    };

    const check = () => {
      const top = keyboardTop.current;
      const root = ref.current as any;
      const input = TextInput.State.currentlyFocusedInput() as any;
      if (top == null || !root) return;
      const id = ++request;
      // Nothing focused here any more (the screen with the field closed while
      // the keys were still up): there is nothing to keep clear, so the
      // screen goes back down rather than staying slid up over a black band.
      if (!input?.measureInWindow) {
        moveTo(0);
        return;
      }
      void (async () => {
        // Only fields drawn inside this view: a Modal's field fails here.
        if (!(await isInside(input, root))) {
          if (id === request) moveTo(0);
          return;
        }
        // Composers that lift themselves are already handled.
        for (const composer of selfLiftingComposers) {
          if (await isInside(input, composer.current)) {
            if (id === request) moveTo(0);
            return;
          }
        }
        const panned = applied.current;
        input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          if (id !== request || keyboardTop.current !== top || !h) return;
          // How far the keys would cover the field with no pan applied.
          // measureInWindow is below the status bar on Android; the keys are in screen space.
          const windowTop = Platform.OS === "android" ? StatusBar?.currentHeight ?? 0 : 0;
          const overlap = y + windowTop + h + panned - top;
          // Never more than the keyboard is tall. A field scrolled out of its
          // list measures far below the keys, and panning for it slid the
          // whole screen off and left it black.
          const screenHeight = Dimensions.get("screen")?.height ?? 0;
          const keyboardHeight = Math.max(screenHeight - top, 0);
          // A field drawn entirely below the screen is a hidden sheet's field
          // (a closed menu's search box), not one being typed in. Sliding the
          // app up for it only left a black band under the nav bar.
          if (screenHeight > 0 && y + windowTop + panned >= screenHeight) {
            moveTo(0);
            return;
          }
          moveTo(overlap > 0 ? Math.min(overlap + CLEARANCE, keyboardHeight) : 0);
        });
      })();
    };

    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
      if (poll) clearInterval(poll);
      poll = null;
    };

    const show = (event: KeyboardEvent) => {
      keyboardTop.current = keyboardTopFromEvent(
        event.endCoordinates,
        Platform.OS,
        Dimensions.get("screen")?.height ?? 0,
        navBar.current,
      );
      clear();
      // iOS fires this before the keys slide up, and before any screen that
      // lifts its own field on the same event has re-rendered. Measuring now
      // saw the field still at the bottom and panned for it, then the next
      // check undid it: a jolt each time the keyboard's frame changed. Wait
      // for the slide to finish first.
      const settleFrom = Platform.OS === "ios" ? Math.max(event.duration ?? 250, 0) + 50 : 0;
      if (!settleFrom) check();
      timers = (settleFrom ? [settleFrom, ...SETTLE_MS.map((ms) => settleFrom + ms)] : SETTLE_MS)
        .map((ms) => setTimeout(check, ms));
      poll = setInterval(check, POLL_MS);
    };
    const hide = () => {
      keyboardTop.current = null;
      request++;
      clear();
      moveTo(0);
    };

    const shown = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", show);
    const hidden = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", hide);
    return () => {
      clear();
      shown.remove();
      hidden.remove();
    };
  }, [pan]);

  return (
    <Animated.View ref={ref as any} collapsable={false} style={[styles.fill, { transform: [{ translateY: pan }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
