import React from "react";
import { View } from "react-native";
import { useRoute } from "@react-navigation/native";
import LiveStreamPlayer from "../components/VideoPlayer/LiveStreamPlayer";

type RouteParams = {
  tokenId?: string | number;
  streamKey?: string;
};

const LiveViewerScreen: React.FC = () => {
  const route = useRoute<any>();
  const { tokenId, streamKey } = (route.params || {}) as RouteParams;
  return (
    <View className="flex-1 bg-black">
      <LiveStreamPlayer tokenId={tokenId} streamKey={streamKey} />
    </View>
  );
};

export default LiveViewerScreen;
