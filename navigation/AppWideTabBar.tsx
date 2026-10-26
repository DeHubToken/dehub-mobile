import React, { useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { navigationRef } from "../App";
import { ScreenNames } from "./ScreenNames";
import StandaloneTabBar from "./StandaloneTabBar";
import { useOwnTabBarCount } from "../libs/tab-bar-presence";

/**
 * Pages where the bottom bar has no place: the tabs (they draw the real one),
 * full-screen media and players, cameras and composers, chats with their own
 * message box, and sign-in. Everywhere else, the bar stays.
 */
const NO_BAR = new Set<string>([
  ScreenNames.Home,
  ScreenNames.DM,
  ScreenNames.UploadTab,
  ScreenNames.AIChat,
  ScreenNames.Explore,
  ScreenNames.ProfileTab,
  ScreenNames.SignIn,
  ScreenNames.SignInTv,
  ScreenNames.Upload,
  ScreenNames.UploadQueue,
  ScreenNames.EditProfile,
  ScreenNames.MediaEditor,
  ScreenNames.VideoRemix,
  ScreenNames.Creator,
  ScreenNames.CreatorStudio,
  ScreenNames.CreatorFlow,
  ScreenNames.CreatorFlowView,
  ScreenNames.Maboroshi,
  ScreenNames.CreatorRemake,
  ScreenNames.ImageViewer,
  ScreenNames.FullscreenVideo,
  ScreenNames.ShortsViewer,
  ScreenNames.VideoPlayer,
  ScreenNames.LiveViewer,
  ScreenNames.LiveProducer,
  ScreenNames.LiveStudio,
  ScreenNames.Chat,
  ScreenNames.LiveChat,
  ScreenNames.StageRecording,
  ScreenNames.ArcadeGame,
  ScreenNames.ArcadeChessOnline,
  ScreenNames.MiniApp,
  ScreenNames.MiniAppDev,
  ScreenNames.Cinema,
  ScreenNames.TV,
  ScreenNames.Builder,
  ScreenNames.BuilderPreview,
  ScreenNames.WorkPost,
  ScreenNames.WorkEdit,
  ScreenNames.LaunchpadCreate,
]);

function currentRouteName(): string | undefined {
  return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
}

/**
 * The bottom bar over pages pushed on top of the tabs, so it doesn't vanish
 * the moment you leave Home. It stands down where a page draws its own copy,
 * on the pages above, and while the keyboard is up.
 */
export default function AppWideTabBar() {
  const [route, setRoute] = useState(currentRouteName);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const ownBars = useOwnTabBarCount();

  useEffect(() => {
    const sync = () => setRoute(currentRouteName());
    sync();
    return navigationRef.addListener("state", sync);
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (!route || NO_BAR.has(route) || ownBars > 0 || keyboardUp) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <StandaloneTabBar appWide />
    </View>
  );
}
