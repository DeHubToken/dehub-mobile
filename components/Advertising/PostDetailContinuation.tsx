import React, { useMemo } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import FeedCard from "../Home/FeedCard";
import { useServedAds } from "../../hooks/useAdServing";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { getNFT } from "../../services/nft.service";
import SponsoredAdCard from "./SponsoredAdCard";

const HOUSE_AD_POST_ID = "2008";
const POSTS_PER_PAGE = 6;

interface PostDetailContinuationProps {
  currentPostId: string;
}

/** Ad first, then an explicitly paginated continuation of recent posts. */
export default function PostDetailContinuation({ currentPostId }: PostDetailContinuationProps) {
  const { data: servedAds = [], isLoading: servedAdLoading } = useServedAds("related", { count: 1 });
  const servedAd = servedAds[0] ?? null;

  const { data: houseAdResponse, isLoading: houseAdLoading } = useQuery({
    queryKey: ["post-detail-house-ad", HOUSE_AD_POST_ID],
    queryFn: () => getNFT(HOUSE_AD_POST_ID),
    staleTime: 30 * 60 * 1000,
    enabled: !servedAd,
  });

  const houseAd = useMemo(() => {
    const response = houseAdResponse as any;
    return (response?.result ?? response ?? null) as UnifiedFeedItem | null;
  }, [houseAdResponse]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading,
  } = useInfiniteQuery({
    queryKey: ["post-detail-more-posts", currentPostId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getUnifiedFeed({
      page: pageParam,
      limit: POSTS_PER_PAGE,
      sortBy: "createdAt",
      sortOrder: "desc",
      status: "all",
    }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const posts = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((page) => page.result) ?? []).filter((post) => {
      const id = String(post.tokenId ?? post.id ?? "");
      if (!id || id === currentPostId || id === HOUSE_AD_POST_ID || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [currentPostId, data]);

  return (
    <View className="border-t border-theme-neutrals-800 pt-5">
      <View className="px-4">
        {servedAd ? (
          <SponsoredAdCard ad={servedAd} />
        ) : houseAd ? (
          <View className="rounded-2xl border border-theme-neutrals-700 bg-theme-neutrals-800/50 p-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-xs text-theme-neutrals-400">Sponsored</Text>
              <View className="rounded bg-yellow-500 px-1.5 py-0.5">
                <Text className="text-xs font-bold text-black">AD</Text>
              </View>
            </View>
            <FeedCard item={houseAd} />
          </View>
        ) : servedAdLoading || houseAdLoading ? (
          <View className="h-48 items-center justify-center rounded-2xl bg-theme-neutrals-800/50">
            <ActivityIndicator color="#A1A1AA" />
          </View>
        ) : null}
      </View>

      <Text className="px-4 pb-1 pt-7 text-sm font-semibold text-theme-neutrals-100">
        More posts
      </Text>

      {posts.map((post) => (
        <View key={String(post.tokenId ?? post.id)} className="px-4 py-2">
          <FeedCard item={post} />
        </View>
      ))}

      {postsLoading && posts.length === 0 && (
        <View className="items-center py-8">
          <ActivityIndicator color="#A1A1AA" />
        </View>
      )}

      {hasNextPage && (
        <TouchableOpacity
          onPress={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Load more posts"
          className="mx-4 my-4 items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800/60 py-3"
        >
          {isFetchingNextPage ? (
            <ActivityIndicator size="small" color="#E4E4E7" />
          ) : (
            <Text className="text-sm font-medium text-theme-neutrals-100">Load more posts</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
