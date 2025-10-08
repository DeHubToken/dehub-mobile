import React from "react";
import { View } from "react-native";
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

const LiveViewerScreen: React.FC = () => {
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams;
  return (
    <View className="flex-1 bg-black">
      <LiveStreamPlayer {...params} />
    </View>
  );
};

export default LiveViewerScreen;
