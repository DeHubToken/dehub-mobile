import React from "react";
import { View, StatusBar, Platform } from "react-native";
import { useRoute } from "@react-navigation/native";
import LiveStreamPlayer from "../components/VideoPlayer/LiveStreamPlayer";

type RouteParams = {
  tokenId?: string | number;
  streamKey?: string;
  streamId?: string;
  playbackId?: string;
  nft?: any;
  accessInfo?: any;
};

/**
 * LiveViewerScreen – thin wrapper around LiveStreamPlayer for the viewer flow.
 *
 * All join/leave socket logic lives exclusively inside LiveStreamPlayer so
 * there is exactly one source of truth and no duplicate emissions.
 */
const LiveViewerScreen: React.FC = () => {
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams;

  // Resolve the real stream ID from multiple possible sources
  const streamId =
    params.streamId ||
    (params.nft as any)?.stream?._id ||
    (params.nft as any)?.stream?.id ||
    (params.nft as any)?._id ||
    null;

  return (
    <View className="flex-1 bg-black">
      {Platform.OS !== "web" && (
        <StatusBar barStyle="light-content" backgroundColor="black" />
      )}
      <LiveStreamPlayer {...params} streamId={streamId ?? params.streamId} />
    </View>
  );
};

export default LiveViewerScreen;
