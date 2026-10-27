import React from "react";
import { View, StatusBar, Platform } from "react-native";
import { useRoute } from "@react-navigation/native";
import LiveStreamPlayer from "../components/VideoPlayer/LiveStreamPlayer";
import { useDarkSurface } from "../context/ThemeContext";

type RouteParams = {
  tokenId?: string | number;
  streamKey?: string;
  streamId?: string;
  playbackId?: string;
  nft?: any;
  accessInfo?: any;
};

/**
 * LiveViewerScreen – immersive fullscreen wrapper around LiveStreamPlayer.
 *
 * All join/leave socket logic lives exclusively inside LiveStreamPlayer so
 * there is exactly one source of truth and no duplicate emissions.
 */
const LiveViewerScreen: React.FC = () => {
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams;
  // Live is a dark room in every theme. Until System Light has handed over to
  // System, paint only the black well: a player drawn under the light tone
  // would keep those colours.
  const dark = useDarkSurface();

  // Resolve the real stream ID from multiple possible sources
  const streamId =
    params.streamId ||
    (params.nft as any)?.stream?._id ||
    (params.nft as any)?.stream?.id ||
    (params.nft as any)?._id ||
    null;

  return (
    <View className="flex-1 dark-surface bg-black">
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={Platform.OS === "android"}
      />
      {dark && <LiveStreamPlayer key={streamId ?? params.tokenId} {...params} streamId={streamId ?? params.streamId} />}
    </View>
  );
};

export default LiveViewerScreen;
