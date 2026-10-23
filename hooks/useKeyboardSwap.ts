import { useCallback, useMemo, useRef, type RefObject } from "react";
import { Keyboard, Platform, type TextInput } from "react-native";

/**
 * Swaps the keyboard for a picker sheet (emoji, GIF) and back, like a
 * messaging app: the sheet opens on the same tap instead of waiting for the
 * keyboard to go down first, and when it closes the keyboard comes back on
 * the same box with the typed text and caret where they were.
 */
export function useKeyboardSwap(inputRef: RefObject<TextInput | null>) {
  const wasTyping = useRef(false);

  const swapTo = useCallback(
    (open: () => void) => {
      wasTyping.current = !!inputRef.current?.isFocused();
      open();
      // The keys drop behind the sheet as it comes up, not before it.
      if (wasTyping.current) requestAnimationFrame(() => Keyboard.dismiss());
    },
    [inputRef],
  );

  const restore = useCallback(() => {
    if (!wasTyping.current) return;
    wasTyping.current = false;
    // After the sheet's own window has gone, or Android hands focus back to it.
    setTimeout(() => inputRef.current?.focus(), 220);
  }, [inputRef]);

  // Android swallows the first tap's onPress while the keyboard hides, so a
  // picker button opens on touch-start there and skips the press that follows.
  const openedOnTouch = useRef(false);
  const pressProps = useCallback(
    (open: () => void) => ({
      onTouchStart: () => {
        if (Platform.OS !== "android") return;
        openedOnTouch.current = true;
        setTimeout(() => {
          openedOnTouch.current = false;
        }, 1500);
        open();
      },
      onPress: () => {
        if (openedOnTouch.current) {
          openedOnTouch.current = false;
          return;
        }
        open();
      },
    }),
    [],
  );

  return useMemo(() => ({ swapTo, restore, pressProps }), [swapTo, restore, pressProps]);
}
