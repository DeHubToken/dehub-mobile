import { useCallback, useEffect, useRef } from "react";
import {
  Keyboard,
  ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type View,
} from "react-native";

/**
 * Keeps a just-revealed input inside the visible part of a ScrollView.
 *
 * The sign-in surfaces expand a text field in the middle of a tall stack and
 * autoFocus it, which raises the keyboard over the very field that was
 * revealed. Nothing scrolls on its own: KeyboardAvoidingView only changes how
 * much viewport there is, and this app is edge-to-edge (gradle.properties
 * `edgeToEdgeEnabled=true`, targetSdk 35), so the manifest's `adjustResize` is
 * inert on Android and even the viewport does not shrink by itself.
 *
 * Two things this has to get right, both of which are easy to get wrong:
 *
 *  1. WHEN to measure. The field's own `onLayout` fires once, before the
 *     keyboard exists — measuring there always concludes "not clipped",
 *     because at that instant it isn't. The keyboard does not move the field
 *     within the scroll content, so no second `onLayout` ever arrives for it.
 *     The event that actually matters is `keyboardDidShow`, so the target node
 *     is remembered and re-measured then.
 *
 *  2. WHAT to measure against. `onLayout` reports a position relative to the
 *     immediate parent, and these fields sit two Views deep inside the scroll
 *     content, so it cannot be used directly. `measureLayout` against the
 *     ScrollView's inner content view gives a `y` that IS a content offset —
 *     but under Fabric it must be handed the content view's ELEMENT, not a
 *     node handle. `ReactNativeElement.measureLayout` starts with an
 *     `instanceof ReactNativeElement` check and silently returns if given a
 *     number: no throw, no `onFail`, no scroll. `getInnerViewNode()` returns
 *     exactly that number, so it is the wrong accessor here despite being the
 *     obvious one; `getInnerViewRef()` returns the element.
 *
 * Everything is still best-effort. If measurement is unavailable the screen
 * behaves as it did before rather than scrolling somewhere wrong.
 */

/** Breathing room kept between the field and the edge it was clipped by. */
const MARGIN = 16;

/**
 * `getInnerViewRef` exists in RN 0.81's ScrollView implementation but is absent
 * from its .d.ts (which declares only `getInnerViewNode(): any`), so it has to
 * be reached through a cast. There is no local typechecker on this project and
 * a type error takes the whole CI suite down with it, hence the explicit shape
 * rather than `as any`.
 */
type ScrollViewWithInnerRef = { getInnerViewRef?: () => View | null };

export function useScrollFieldIntoView() {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const viewportRef = useRef(0);
  /** The field awaiting a keyboard, so it can be re-measured once one exists. */
  const targetRef = useRef<View | null>(null);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const measureAndScroll = useCallback((node: View | null) => {
    const scroll = scrollRef.current;
    if (!node || !scroll) return;
    const inner = (scroll as unknown as ScrollViewWithInnerRef).getInnerViewRef?.();
    if (!inner) return;

    try {
      node.measureLayout(
        inner,
        (_x, y, _width, height) => {
          const viewport = viewportRef.current;
          if (!viewport) return;
          const offset = offsetRef.current;
          const top = y - MARGIN;
          const bottom = y + height + MARGIN;
          // Only move when the field is actually clipped, so a layout pass
          // that happens while the user is deliberately scrolling elsewhere
          // doesn't yank them back.
          if (bottom > offset + viewport) {
            scroll.scrollTo({ y: Math.max(0, bottom - viewport), animated: true });
          } else if (top < offset) {
            scroll.scrollTo({ y: Math.max(0, top), animated: true });
          }
        },
        () => {}
      );
    } catch {
      // Measurement is unavailable on this renderer — leave the scroll alone.
    }
  }, []);

  // The ScrollView's own frame, which is what shrinks when the keyboard takes
  // its space. Re-measuring here as well as on keyboardDidShow covers the
  // ordering where the frame change lands after the keyboard event.
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = e.nativeEvent.layout.height;
      const shrank = viewportRef.current > 0 && next < viewportRef.current;
      viewportRef.current = next;
      if (shrank && targetRef.current) measureAndScroll(targetRef.current);
    },
    [measureAndScroll]
  );

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (targetRef.current) measureAndScroll(targetRef.current);
    });
    return () => sub.remove();
  }, [measureAndScroll]);

  /** Register (and immediately try) a field that has just been revealed. */
  const scrollIntoView = useCallback(
    (node: View | null) => {
      targetRef.current = node;
      if (node) measureAndScroll(node);
    },
    [measureAndScroll]
  );

  /**
   * Spread onto the ScrollView. `keyboardShouldPersistTaps` rides along
   * because it is the other half of the same bug: without it the first tap on
   * "Send code" is swallowed dismissing the keyboard, so the button reads as
   * dead until you tap it twice.
   */
  const scrollViewProps = {
    ref: scrollRef,
    onScroll: handleScroll,
    onLayout: handleLayout,
    scrollEventThrottle: 16,
    keyboardShouldPersistTaps: "handled" as const,
  };

  return { scrollRef, scrollViewProps, scrollIntoView };
}
