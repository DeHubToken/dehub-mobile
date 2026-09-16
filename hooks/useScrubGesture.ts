import { useCallback, useMemo, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
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
  /**
   * Claim the touch as soon as it moves at all, instead of waiting for sideways
   * travel. For a dedicated track — a scrub bar — where nothing else on the
   * surface wants the gesture. Leave it off for a surface that doubles as
   * something else (artwork, a card), so a vertical flick still scrolls.
   */
  immediate?: boolean;
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
  immediate = false,
}: ScrubGestureArgs) => {
  const widthRef = useRef(1);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width || 1;
  }, []);

  const pagerRef = usePagerGestureRef();

  const gesture = useMemo(() => {
    const ratioAt = (x: number) => Math.max(0, Math.min(1, x / widthRef.current));

    const pan = Gesture.Pan().enabled(enabled);
    // A dedicated track claims the touch on its first pixel of movement; a
    // shared surface waits for clearly sideways travel so a flick still scrolls.
    if (immediate) pan.minDistance(0);
    else pan.activeOffsetX([-ACTIVATE_PX, ACTIVATE_PX]);

    pan
      // Callbacks touch React state and the player, so they belong on the JS
      // thread — the default is the UI thread and would need runOnJS at every
      // call site.
      .runOnJS(true)
      .onStart((e) => {
        onScrubStart?.();
        onScrub(ratioAt(e.x));
      })
      .onUpdate((e) => onScrub(ratioAt(e.x)))
      .onEnd((e) => onCommit(ratioAt(e.x)))
      .onFinalize((_e, success) => {
        if (!success) onCancel?.();
      });

    const tap = Gesture.Tap()
      .enabled(enabled)
      .maxDistance(ACTIVATE_PX)
      .runOnJS(true)
      .onEnd((e) => {
        onScrubStart?.();
        onCommit(ratioAt(e.x));
      });

    // Composition does not carry `blocksExternalGesture` down to the members,
    // so each one declares it itself.
    if (pagerRef) {
      pan.blocksExternalGesture(pagerRef);
      tap.blocksExternalGesture(pagerRef);
    }

    return Gesture.Race(pan, tap);
  }, [enabled, immediate, onScrubStart, onScrub, onCommit, onCancel, pagerRef]);

  return { onLayout, gesture };
};
