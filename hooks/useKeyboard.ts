import { useEffect, useState } from "react";
import { Keyboard, Platform, KeyboardEvent } from "react-native";

export interface UseKeyboardResult {
  height: number;
  isVisible: boolean;
}

/**
 * Cross-platform keyboard height + visibility hook.
 * Uses `keyboardWillShow/Hide` on iOS for smoother transitions
 * and `keyboardDidShow/Hide` on Android for reliability.
 */
export const useKeyboard = (): UseKeyboardResult => {
  const [height, setHeight] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      setHeight(h);
      setIsVisible(true);
    };
    const onHide = () => {
      setHeight(0);
      setIsVisible(false);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      // RN 0.81: remove via .remove()
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return { height, isVisible };
};

export default useKeyboard;
