import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKidsMode } from "../../hooks/useKidsMode";
import { ScreenNames } from "../../navigation/ScreenNames";
import StageMiniPlayer from "./StageMiniPlayer";

const tabRoutes = new Set<string>([ScreenNames.Home, ScreenNames.DM, ScreenNames.UploadTab, ScreenNames.AIChat, ScreenNames.Explore]);
// Their composer ends at the nav bar, so the chip would sit on the send button
// and swallow the tap. The room stays one tab away through the tab-bar chip.
const composerRoutes = new Set<string>([ScreenNames.Chat, ScreenNames.LiveChat, ScreenNames.FeedDetail]);

interface NavRef {
  isReady?: () => boolean;
  getCurrentRoute: () => { name: string } | undefined;
  addListener: (event: "state", callback: () => void) => () => void;
}

// This mounts beside the navigator, before it is ready on a cold start, and
// asking a ref that is not ready logs "The 'navigation' object hasn't been
// initialized yet" as an error on every launch.
const currentRoute = (ref: NavRef) => (ref.isReady?.() === false ? undefined : ref.getCurrentRoute()?.name);

/** Screens pushed above the tab navigator still need a way back to the room. */
export default function StageNavFallback({ navigationRef }: { navigationRef: NavRef }) {
  const [route, setRoute] = useState(() => currentRoute(navigationRef));
  const insets = useSafeAreaInsets();
  const { isKidsMode } = useKidsMode();
  useEffect(() => {
    const update = () => setRoute(currentRoute(navigationRef));
    update();
    return navigationRef.addListener("state", update);
  }, [navigationRef]);
  if (!route || tabRoutes.has(route) || composerRoutes.has(route) || isKidsMode) return null;
  // An absolute child ignores the root SafeAreaView's padding, so this is
  // measured from the screen edge and the inset is counted once.
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", right: 16, bottom: insets.bottom + 12 }}>
      <StageMiniPlayer />
    </View>
  );
}
