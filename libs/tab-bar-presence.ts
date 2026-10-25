import { useContext, useEffect, useSyncExternalStore } from "react";
import { NavigationContext } from "@react-navigation/native";
import { makeMutable } from "react-native-reanimated";

/**
 * 1 while the reader has dragged the bottom bar away, 0 otherwise. One value
 * for every copy of the bar, so a bar put away on one page stays away on the
 * next until they drag it back up.
 */
export const tabBarDraggedAway = makeMutable(0);

/*
 * Pages that draw their own bottom bar (a pushed profile, the profile sheet)
 * say so here while they are on screen, so the app-wide bar over the stack
 * stands down instead of drawing a second one in the same place.
 */
let ownBars = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useOwnTabBarCount(): number {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => ownBars,
  );
}

/** Counts this page's own bar while its screen is focused (always, outside a screen). */
export function useRegisterOwnTabBar(enabled = true): void {
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!enabled) return;
    let counted = false;
    const set = (on: boolean) => {
      if (on === counted) return;
      counted = on;
      ownBars += on ? 1 : -1;
      emit();
    };
    set(navigation ? navigation.isFocused() : true);
    if (!navigation) return () => set(false);
    const offFocus = navigation.addListener("focus", () => set(true));
    const offBlur = navigation.addListener("blur", () => set(false));
    return () => { offFocus(); offBlur(); set(false); };
  }, [enabled, navigation]);
}
