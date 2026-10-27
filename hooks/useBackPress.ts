import { useContext, useEffect } from "react";
import { BackHandler } from "react-native";
import { NavigationContext } from "@react-navigation/native";

/**
 * Android back for a layer inside a screen: a sheet, a panel, a post opened in
 * place. BackHandler is app-wide and asks the newest listener first, so a layer
 * left open on a screen that is now covered (a tab left behind, a screen pushed
 * on top) took the press meant for the screen in front, and Back looked like it
 * did nothing. Presses are only taken while the nearest screen is focused;
 * outside any navigator there is no screen to be covered, so they always are.
 */
export function useBackPress(onBack: () => void, enabled = true) {
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (navigation && !navigation.isFocused()) return false;
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [enabled, navigation, onBack]);
}
