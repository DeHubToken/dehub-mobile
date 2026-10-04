import React, { useMemo } from "react";
import FloatingBottomTabBar from "./FloatingBottomTabBar";
import { ScreenNames } from "./ScreenNames";
import { navigationRef } from "../App";
import { useAuthState } from "../context/AuthContext";

const TAB_ROUTES = [
  ScreenNames.Home,
  ScreenNames.DM,
  ScreenNames.UploadTab,
  ScreenNames.AIChat,
  ScreenNames.Explore,
].map((name) => ({ key: name, name }));

/**
 * The home screen's bottom nav, for screens that live outside the tab
 * navigator (the profile pages sit on the root stack or in a modal above it).
 *
 * FloatingBottomTabBar only reads `state` and calls `navigation.emit` /
 * `navigation.navigate`, so this hands it a tab state with no tab focused and
 * routes its presses through the root navigator: a tab pops back to the tabs
 * already under this screen, + opens the composer the way the real + tab does,
 * and the scrolling items push their screen as usual.
 *
 * Hide-on-scroll comes from the nearest TabBarHideProvider, the same as on
 * home; wrap the screen in one and drive it with useTabBarScrollHide.
 */
const StandaloneTabBar: React.FC<{ onBeforeNavigate?: () => void }> = ({ onBeforeNavigate }) => {
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const props = useMemo(() => {
    const go = (name: string, params?: Record<string, unknown>) => {
      if (!navigationRef.isReady()) return;
      onBeforeNavigate?.();
      if (name === ScreenNames.UploadTab) {
        const creatingBounty = navigationRef.getCurrentRoute()?.name.startsWith('Work');
        navigationRef.navigate((creatingBounty ? ScreenNames.WorkPost : isAuthed ? ScreenNames.Upload : ScreenNames.SignIn) as never);
      } else if (TAB_ROUTES.some((r) => r.name === name)) {
        navigationRef.navigate({ name: ScreenNames.Root, params: { screen: name }, pop: true } as never);
      } else {
        (navigationRef.navigate as (screen: string, params?: Record<string, unknown>) => void)(name, params);
      }
    };
    return {
      state: { index: -1, routes: TAB_ROUTES },
      navigation: { emit: () => ({ defaultPrevented: false }), navigate: go },
    };
  }, [isAuthed, onBeforeNavigate]);

  return <FloatingBottomTabBar {...(props as any)} />;
};

export default StandaloneTabBar;
