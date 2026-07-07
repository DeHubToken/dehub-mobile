import React from "react";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import CompactVideoInfiniteList from "../Home/CompactVideoInfiniteList";

const FALLBACK_ADDRESS = "0x4B12Ca78C722253cd174Db212E2122b1E635a18A";

interface LivestreamsRouteProps {
  address?: string;
  showCreator?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

const LivestreamsRoute: React.FC<LivestreamsRouteProps> = ({
  address,
  showCreator = true,
  onScroll,
}) => (
  <CompactVideoInfiniteList
    address={address || FALLBACK_ADDRESS}
    variant="live"
    enablePreview={false}
    bottomPadding={80}
    showCreator={showCreator}
    onScroll={onScroll}
  />
);

export default LivestreamsRoute;
