import React, { FC, useCallback } from "react";
import { FlatList, View, Text } from "react-native";
import FeedCard from "../Home/FeedCard";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
// Was referenced below but never imported, so any search whose video or
// livestream results came back empty threw a ReferenceError from render.
import CompactVideoCardSkeleton from "../Home/CompactVideoCardSkeleton";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";

export interface MediaItem {
  tokenId?: string | number;
  id?: string | number;
  streamKey?: string;
  stream?: any;
  thumbnail?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  videoDuration?: number;
  status?: string;
  meta?: any;
  createdAt?: string;
  created_at?: string;
  name?: string;
  title?: string;
  views?: number;
  peakViewers?: number;
  totalViews?: number;
  likes?: number;
  likesCount?: number;
  totalVotes?: { for?: number };
  account?: any;
  minterDisplayName?: string;
  mintername?: string;
  minter?: string;
  owner?: string;
  minterStaked?: number;
  streamInfo?: any;
  [key: string]: any;
}

interface SearchMediaListProps {
  data: MediaItem[];
  loadingMore: boolean;
  onLoadMore: () => void;
  queryType: "videos" | "livestreams";
  hasMore?: boolean;
}

const SearchMediaList: FC<SearchMediaListProps> = ({
  data,
  loadingMore,
  onLoadMore,
  hasMore = false,
}) => {
  const keyExtractor = useCallback((item: MediaItem, idx: number) => {
    const created =
      item.createdAt || item.stream?.createdAt || item.created_at || "nocreated";
    const base =
      item.tokenId || item.id || item.streamKey || item.stream?.id || idx;
    return `${base}-${created}-${idx}`;
  }, []);

  const {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    visibilityExtraData,
  } = useFeedCardVisibility(keyExtractor as (item: unknown, index: number) => string);

  const renderItem = useCallback(
    ({ item, index }: { item: MediaItem; index: number }) => (
      <View style={{ paddingHorizontal: 16 }}>
        {/* Without isVisible, FeedCard defaults it to true and every windowed
            result attaches a native video player. */}
        <FeedCard item={item as any} isVisible={isItemVisible(keyExtractor(item, index), item)} />
      </View>
    ),
    [isItemVisible, keyExtractor],
  );

  if (data.length === 0 && !loadingMore) {
    return (
      <View className="mt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <CompactVideoCardSkeleton key={i} />
        ))}
      </View>
    );
  }
  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      extraData={visibilityExtraData}
      onEndReachedThreshold={0.6}
      onEndReached={onLoadMore}
      ListFooterComponent={
        <View className="mt-2 pb-4">
          {loadingMore && (
            <FeedCardSkeleton count={3} />
          )}
          {!loadingMore && !hasMore && data.length > 0 && (
            <View className="mt-2">
              <Text className="text-center text-theme-neutrals-600 text-[10px]">
                End of results
              </Text>
            </View>
          )}
        </View>
      }
      renderItem={renderItem}
    />
  );
};

export default SearchMediaList;
