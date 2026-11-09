import { startTransition, useContext, useEffect, useState } from "react";
import { NavigationContext } from "@react-navigation/native";

/**
 * Whether this screen is focused, updated in a transition once the navigation
 * that changed it has been drawn.
 *
 * useIsFocused reads a context the navigator changes in the very render that
 * switches screens, so every list, card and player under Home that read it
 * re-rendered (to pause, to stop polling) before a tab switch or a pushed page
 * could show anything: ~0.3s on a Galaxy S24+. Pausing and resuming can land a
 * moment later; the switch itself should not wait for them.
 *
 * Outside a navigator (a sheet, a test) it reports focused, like
 * useAmbientMotion does.
 */
export function useIsFocusedLazy(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);
  useEffect(() => {
    if (!navigation) return;
    const sync = () => {
      const next = navigation.isFocused();
      startTransition(() => setFocused(next));
    };
    sync();
    const offFocus = navigation.addListener("focus", sync);
    const offBlur = navigation.addListener("blur", sync);
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}
