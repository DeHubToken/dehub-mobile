import React, { useCallback, useMemo, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import type { GestureType } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { usePagerGestureRef } from "../context/PagerGestureContext";

/** Sideways travel that turns a touch into a scrub instead of a tap. */
const ACTIVATE_PX = 6;

interface ScrubGestureArgs {
  /** Fired once when a drag takes over, before the first ratio. */
  onScrubStart?: () => void;
  /** Every frame of the drag, and on a tap-to-seek. Ratio is 0..1 of the track. */
  onScrub: (ratio: number) => void;
  /** Finger up: the position to commit. */
  onCommit: (ratio: number) => void;
  /** The gesture was taken away (a sheet opened, the card recycled). */
  onCancel?: () => void;
  enabled?: boolean;
  /** Disable tap recognition when child buttons own stationary taps. */
  tapEnabled?: boolean;
  /**
   * Claim the touch as soon as it moves at all, instead of waiting for sideways
   * travel. For a dedicated track — a scrub bar — where nothing else on the
   * surface wants the gesture. Leave it off for a surface that doubles as
   * something else (artwork, a card), so a vertical flick still scrolls.
   */
  immediate?: boolean;
  /** Dedicated seek strip below the shared button row, in layout points. */
  immediateBottom?: number;
  /**
   * Further gestures the scrub must outrank — the Shorts viewer's own pager,
   * for instance, which is not the Home pager this hook finds through context.
   */
  blocks?: (GestureType | React.RefObject<GestureType | undefined>)[];
}

/**
 * Drag-to-scrub for a track that lives inside the Home pager.
 *
 * A PanResponder cannot win this argument. The pager's page turn is a
 * react-native-gesture-handler pan, and RNGH arbitrates only against other RNGH
 * handlers — it never sees the JS responder a PanResponder claims. So dragging
 * a video's timeline moved the finger *and* dragged the whole page sideways,
 * which read as the screen shaking and the video never seeking. The fix is to
 * be an RNGH gesture too and declare the relation: `blocksExternalGesture` on
 * the pager keeps the page still for as long as the scrub is running.
 *
 * Vertical travel is deliberately left alone. The gesture only activates past
 * `ACTIVATE_PX` of sideways movement, so a flick that starts on the track still
 * scrolls the feed underneath it.
 */
export const useScrubGesture = ({
  onScrubStart,
  onScrub,
  onCommit,
  onCancel,
  enabled = true,
  tapEnabled = true,
  immediate = false,
  immediateBottom = 0,
  blocks,
}: ScrubGestureArgs) => {
  const widthRef = useRef(1);
  const height = useSharedValue(0);
  const touch = useSharedValue({ x: 0, y: 0, dedicated: false, decided: false });
  const callbacks = useRef({ onScrubStart, onScrub, onCommit, onCancel });
  callbacks.current = { onScrubStart, onScrub, onCommit, onCancel };
  const started = useRef(false);

  const start = useCallback((x: number) => {
    started.current = true;
    callbacks.current.onScrubStart?.();
    callbacks.current.onScrub(Math.max(0, Math.min(1, x / widthRef.current)));
  }, []);
  const preview = useCallback((x: number) => {
    callbacks.current.onScrub(Math.max(0, Math.min(1, x / widthRef.current)));
  }, []);
  const commit = useCallback((x: number) => {
    callbacks.current.onCommit(Math.max(0, Math.min(1, x / widthRef.current)));
  }, []);
  const finish = useCallback((success: boolean) => {
    if (!success && started.current) callbacks.current.onCancel?.();
    started.current = false;
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width || 1;
    height.value = e.nativeEvent.layout.height;
  }, [height]);

  const pagerRef = usePagerGestureRef();

  const gesture = useMemo(() => {
    // Decide direction on the UI thread before the pager can activate. A fixed
    // failOffsetY rejects even mostly-horizontal drags when one event crosses
    // both thresholds. Once claimed, vertical drift must not release the scrub.
    const pan = Gesture.Pan().enabled(enabled).maxPointers(1)
      .manualActivation(true)
      .shouldCancelWhenOutside(false)
      .onTouchesDown((event, manager) => {
        const point = event.allTouches[0];
        if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
        touch.value = {
          x: point.absoluteX, y: point.absoluteY, decided: false,
          dedicated: immediate || (immediateBottom > 0 && point.y >= height.value - immediateBottom),
        };
      })
      .onTouchesMove((event, manager) => {
        const point = event.allTouches[0];
        if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
        const origin = touch.value;
        if (origin.decided) return;
        const dx = Math.abs(point.absoluteX - origin.x);
        const dy = Math.abs(point.absoluteY - origin.y);
        if (origin.dedicated || (dx > ACTIVATE_PX && dx > dy)) {
          touch.value = { ...origin, decided: true };
          manager.activate();
        } else if (dy > ACTIVATE_PX && dy >= dx) {
          touch.value = { ...origin, decided: true };
          manager.fail();
        }
      })
      .onStart((e) => { runOnJS(start)(e.x); })
      .onUpdate((e) => { runOnJS(preview)(e.x); })
      .onEnd((e, success) => {
        if (success) runOnJS(commit)(e.x);
      })
      .onFinalize((_e, success) => {
        runOnJS(finish)(success);
      });

    const tap = Gesture.Tap()
      .enabled(enabled && tapEnabled)
      .maxDistance(ACTIVATE_PX)
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success || !tapEnabled) return;
        start(e.x);
        commit(e.x);
        finish(true);
      });

    // Composition does not carry `blocksExternalGesture` down to the members,
    // so each one declares it itself.
    const blocked = [...(pagerRef ? [pagerRef] : []), ...(blocks ?? [])];
    if (blocked.length) {
      pan.blocksExternalGesture(...blocked);
      tap.blocksExternalGesture(...blocked);
    }

    return tapEnabled ? Gesture.Race(pan, tap) : pan;
  }, [enabled, immediate, immediateBottom, tapEnabled, pagerRef, blocks, height, touch, start, preview, commit, finish]);

  // RNGH runs beside the JS responder system, not inside it, so an ancestor
  // Pressable never learns that the scrub took the touch: the feed card's own
  // onPress still fired on release and a drag along the timeline opened the
  // post page, while a tap on it toggled playback behind the seek. Claiming
  // the responder on the track itself is what stops that -- the ancestor is
  // only offered the touch if nothing nearer took it. Termination is left
  // negotiable so a vertical flick that starts on the track still hands the
  // gesture to the list and scrolls the feed. Return false from the grant to
  // keep Android native recognizers available while the JS responder guards
  // against a parent press.
  const touchGuard = useMemo(
    () =>
      enabled
        ? {
            onStartShouldSetResponder: () => true,
            onResponderGrant: () => false,
            onResponderRelease: () => {},
          }
        : {},
    [enabled],
  );

  return { onLayout, gesture, touchGuard };
};
