import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  RefreshControl,
  View,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import HomeFeedCard from "../Home/HomeFeedCard";
import VideoCard from "../Home/VideoCard";
import LiveStreamCard from "../Home/LiveStreamCard";
import VideoCardSkeleton from "../Home/VideoCardSkeleton";
import { getMyPosts, getLikedPosts, getSavedPosts } from "../../services/user.service";
import { GetNFTsResponse, GetNFTsResult } from "../../services/nft.service";

// Helper to determine if item is a video
const isVideoItem = (item: any): boolean => {
  return !item.postType || item.postType === "video";
};

type PostVariant = "myPosts" | "liked" | "saved";

interface PostsInfiniteListProps {
  variant: PostVariant;
  pageSize?: number;
  bottomPadding?: number;
}

interface PostItem extends GetNFTsResult {}

const DEFAULT_PAGE_SIZE = 20;

const PostsInfiniteList: React.FC<PostsInfiniteListProps> = ({
  variant,
  pageSize = DEFAULT_PAGE_SIZE,
  bottomPadding = 0,
}) => {
  const [items, setItems] = useState<PostItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);

  const fetcher = useCallback(
    (opts: { page: number; unit: number }): Promise<GetNFTsResponse> => {
      switch (variant) {
        case "liked":
          return getLikedPosts(opts);
        case "saved":
          return getSavedPosts(opts);
        case "myPosts":
        default:
          return getMyPosts(opts);
      }
    },
    [variant]
  );

  const loadPage = useCallback(
    async (targetPage: number, replace = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (targetPage === 0 && !replace) setLoading(true);
      try {
        const res = await fetcher({ page: targetPage, unit: pageSize });
        const newItems = res?.result || [];
        // Check hasMore from response or fallback to length check
        const responseHasMore = (res as any)?.hasMore;
        setHasMore(responseHasMore ?? newItems.length === pageSize);
        setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setPage(targetPage);
      } catch (e) {
        console.warn("[PostsInfiniteList] loadPage error", e);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize, fetcher]
  );

  useEffect(() => {
    loadPage(0, true);
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadPage(page + 1);
  }, [hasMore, page, loadPage]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    setItems([]);
    loadPage(0, true);
  }, [loadPage]);

  const keyExtractor = useCallback((item: PostItem, index: number) => {
    const created = (item as any).createdAt || (item as any).created_at || "nocreated";
    return `${item.id || (item as any).tokenId || "post"}-${created}-${index}`;
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PostItem>) => {
      // Render LiveStreamCard for livestream content
      if ((item as any).postType === "live") {
        return (
          <LiveStreamCard
            item={item as any}
            onCategorySelect={() => {}}
          />
        );
      }
      // Render VideoCard for video content, HomeFeedCard for feed posts
      if (isVideoItem(item)) {
        return (
          <VideoCard
            nft={item as any}
            enablePreview
            onCategorySelect={() => {}}
          />
        );
      }
      return (
        <HomeFeedCard
          item={item as any}
          onCategorySelect={() => {}}
        />
      );
    },
    []
  );

  const ListFooter = useMemo(() => {
    if (!hasMore) return null;
    return (
      <View className="py-4 items-center">
        <ActivityIndicator color="#fff" />
      </View>
    );
  }, [hasMore]);

  const emptyMessage = useMemo(() => {
    switch (variant) {
      case "liked":
        return "No liked posts yet.";
      case "saved":
        return "No saved posts yet.";
      case "myPosts":
      default:
        return "No posts yet.";
    }
  }, [variant]);

  const ListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View>
          <VideoCardSkeleton count={4} />
        </View>
      );
    }
    return (
      <View className="py-16 items-center px-6">
        <Ionicons
          name={variant === "saved" ? "bookmark-outline" : variant === "liked" ? "heart-outline" : "grid-outline"}
          size={48}
          color="#6b7280"
        />
        <Text className="text-theme-neutrals-400 text-base mt-4 text-center">
          {emptyMessage}
        </Text>
      </View>
    );
  }, [loading, variant, emptyMessage]);

  return (
    <FlatList
      className="flex-1 bg-theme-neutrals-900"
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={ListFooter}
      initialNumToRender={10}
      windowSize={11}
      removeClippedSubviews
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#fff"
        />
      }
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: bottomPadding,
        flexGrow: items.length === 0 && !loading ? 1 : undefined,
      }}
      ListEmptyComponent={ListEmpty}
    />
  );
};

export default PostsInfiniteList;
