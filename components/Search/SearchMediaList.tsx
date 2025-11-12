import React, { FC } from "react";
import { FlatList, View, Text } from "react-native";
import VideoCard from "../Home/VideoCard";
import CompactVideoCardSkeleton from "../Home/CompactVideoCardSkeleton";

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
      keyExtractor={(item, idx) => {
        const created =
          item.createdAt ||
          item.stream?.createdAt ||
          item.created_at ||
          "nocreated";
        const base =
          item.tokenId || item.id || item.streamKey || item.stream?.id || idx;
        return `${base}-${created}-${idx}`;
      }}
      onEndReachedThreshold={0.6}
      onEndReached={onLoadMore}
      ListFooterComponent={
        <View className="mt-2 pb-4">
          {loadingMore && (
            <View>
              {Array.from({ length: 3 }).map((_, i) => (
                <CompactVideoCardSkeleton key={`vid-sk-${i}`} />
              ))}
            </View>
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
      renderItem={({ item }) => (
        <View style={{paddingHorizontal: 16}}>
          <VideoCard nft={item as any} enablePreview />
        </View>
      )}
    />
  );
};

export default SearchMediaList;
