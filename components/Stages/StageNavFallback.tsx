import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKidsMode } from "../../hooks/useKidsMode";
import { ScreenNames } from "../../navigation/ScreenNames";
import StageMiniPlayer from "./StageMiniPlayer";

const tabRoutes = new Set<string>([ScreenNames.Home, ScreenNames.DM, ScreenNames.UploadTab, ScreenNames.AIChat, ScreenNames.Explore]);

/** Screens pushed above the tab navigator still need a way back to the room. */
export default function StageNavFallback({ navigationRef }: {
  navigationRef: {
    getCurrentRoute: () => { name: string } | undefined;
    addListener: (event: "state", callback: () => void) => () => void;
  };
}) {
  const [route, setRoute] = useState(() => navigationRef.getCurrentRoute()?.name);
  const insets = useSafeAreaInsets();
  const { isKidsMode } = useKidsMode();
  useEffect(() => {
    const update = () => setRoute(navigationRef.getCurrentRoute()?.name);
    update();
    return navigationRef.addListener("state", update);
  }, [navigationRef]);
  if (!route || tabRoutes.has(route) || isKidsMode) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", right: 16, bottom: insets.bottom + 12 }}>
      <StageMiniPlayer />
    </View>
  );
}
