import React from "react";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import CompactVideoInfiniteList from "../Home/CompactVideoInfiniteList";

const FALLBACK_ADDRESS = "0x4B12Ca78C722253cd174Db212E2122b1E635a18A";

interface LivestreamsRouteProps {
  address?: string;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  showCreator?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
}

const LivestreamsRoute: React.FC<LivestreamsRouteProps> = ({
  address,
  listRef,
  showCreator = true,
  onScroll,
  listHeader,
  onBeforeNavigate,
}) => (
  <CompactVideoInfiniteList
      listRef={listRef}
    address={address || FALLBACK_ADDRESS}
    variant="live"
    enablePreview={false}
    bottomPadding={80}
    showCreator={showCreator}
    onScroll={onScroll}
    ListHeaderComponent={listHeader}
    onBeforeNavigate={onBeforeNavigate}
  />
);

export default LivestreamsRoute;
