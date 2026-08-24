import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboard } from "./useKeyboard";

/**
 * Keyboard geometry for surfaces that live INSIDE the navigator.
 *
 * Both helpers exist because of one fact that is invisible from any single
 * screen: `App.tsx`'s BootGate wraps the whole `NavigationContainer` in a
 * full-edge `<SafeAreaView>`. Every screen therefore starts `insets.top` below
 * the physical top of the window and ends `insets.bottom` above its bottom,
 * while the keyboard reports its frame in *screen* coordinates. Screens that
 * ignore that mismatch lift by the wrong amount, which is what "the screen
 * changes view when I type" looks like on a notched iPhone.
 *
 * Anything rendered inside a native `<Modal>` is a separate window that does
 * NOT sit under that SafeAreaView, so modal-hosted sheets must keep using the
 * raw values from `useKeyboard()` and their own insets. See
 * `components/ui/GlassModal.tsx` for that side of the split.
 */

/**
 * How far a bottom-anchored surface has to rise to sit exactly on the
 * keyboard.
 *
 * iOS reports `endCoordinates.height` for a keyboard that spans to the
 * physical bottom of the screen — the home indicator sits *over* the keyboard,
 * so that height already contains `insets.bottom`. The container has already
 * given that band up to the root SafeAreaView, so lifting by the raw height
 * pushes the composer a full home-indicator above the keys and leaves a dead
 * strip under it. Subtract what the container never had.
 */
export function useKeyboardLift(): {
  /** Points to raise a bottom-anchored element by. 0 when the keyboard is down. */
  lift: number;
  isVisible: boolean;
  /** The untouched keyboard height, for callers that need the real frame. */
  rawHeight: number;
} {
  const { height, isVisible } = useKeyboard();
  const insets = useSafeAreaInsets();

  return {
    lift: isVisible ? Math.max(height - insets.bottom, 0) : 0,
    isVisible,
    rawHeight: height,
  };
}

/**
 * `keyboardVerticalOffset` for a `KeyboardAvoidingView` inside the navigator.
 *
 * RN measures the view with `onLayout`, which is relative to its parent, then
 * compares it against the keyboard's absolute `screenY`. `keyboardVerticalOffset`
 * is the documented correction: the distance from the top of the window to the
 * top of the KeyboardAvoidingView. Inside this app that is always the device
 * inset the root SafeAreaView spent, plus whatever chrome the screen draws
 * above its own KeyboardAvoidingView — usually a `ScreenHeader`, hence
 * `SCREEN_HEADER_HEIGHT`.
 *
 * Hardcoding it (the old values were `64`, `insets.top + 44` and `0`) is wrong
 * on every device whose notch is not exactly that tall: too large lifts the
 * content clear of the keyboard and scrolls the top of the screen away, too
 * small leaves the focused field behind the keys.
 *
 * @param chromeAbove Height in points of anything the screen renders above its
 * KeyboardAvoidingView. Pass 0 when the KeyboardAvoidingView is the screen's
 * outermost element.
 */
export function useKeyboardOffset(chromeAbove: number = 0): number {
  const insets = useSafeAreaInsets();
  return insets.top + chromeAbove;
}
