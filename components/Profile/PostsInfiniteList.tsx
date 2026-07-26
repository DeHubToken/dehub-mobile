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
  Pressable,
  RefreshControl,
  View,
  Text,
} from "react-native";
import FeedCard from "../Home/FeedCard";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
import { getMyPosts, getLikedPosts, getSavedPosts, getUnlockedPosts, getWatchHistory } from "../../services/user.service";
import { getFolderItems } from "../../services/bookmark.service";
import { GetNFTsResponse, GetNFTsResult } from "../../services/nft.service";
import Icon from "../ui/Icon";

type PostVariant = "myPosts" | "liked" | "saved" | "unlocked" | "watched" | "folder";

interface PostsInfiniteListProps {
  variant: PostVariant;
  pageSize?: number;
  bottomPadding?: number;
  folderId?: string | number;
}

interface PostItem extends GetNFTsResult {}

const DEFAULT_PAGE_SIZE = 20;

const PostsInfiniteList: React.FC<PostsInfiniteListProps> = ({
  variant,
  pageSize = DEFAULT_PAGE_SIZE,
  bottomPadding = 0,
  folderId,
}) => {
  const [items, setItems] = useState<PostItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // A failed first page used to be swallowed by a console.warn, leaving items
  // empty — so a network error rendered "No posts yet", telling the user their
  // library was empty when the request had actually failed.
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);

  const fetcher = useCallback(
    (opts: { page: number; unit: number }): Promise<GetNFTsResponse> => {
      switch (variant) {
        case "liked":
          return getLikedPosts(opts);
        case "saved":
          return getSavedPosts(opts);
        case "unlocked":
          return getUnlockedPosts(opts);
        case "watched":
          return getWatchHistory(opts);
        case "folder":
          if (folderId == null) throw new Error("Folder ID required");
          return getFolderItems(folderId, { page: opts.page + 1, limit: opts.unit });
        case "myPosts":
        default:
          return getMyPosts(opts);
      }
    },
    [variant, folderId]
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
        setError(false);
      } catch (e) {
        console.warn("[PostsInfiniteList] loadPage error", e);
        // Only surface the error UI when there is nothing to show. A failed
        // page 2 keeps the already-rendered posts on screen.
        if (targetPage === 0) setError(true);
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
      return (
        <FeedCard
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
      case "unlocked":
        return "No unlocked posts yet.";
      case "watched":
        return "No watch history yet.";
      case "folder":
        return "No posts in this folder yet.";
      case "myPosts":
      default:
        return "No posts yet.";
    }
  }, [variant]);

  const ListEmpty = useMemo(() => {
    if (loading) {
      return (
        <View>
          <FeedCardSkeleton count={4} />
        </View>
      );
    }
    // Failed load: offer a retry instead of claiming the list is empty.
    // Mirrors the pattern already used in components/Home/InfiniteVideoFeed.tsx.
    if (error) {
      return (
        <View className="py-16 items-center px-6">
          <Icon name="WifiOff" size={48} color="#6b7280" />
          <Text className="text-theme-neutrals-400 text-base mt-4 text-center">
            Couldn&apos;t load posts.
          </Text>
          <Pressable
            onPress={() => loadPage(0, true)}
            hitSlop={8}
            className="mt-4 rounded-xl px-4 justify-center items-center"
            style={{ height: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.30)" }}
          >
            <Text className="text-white text-sm font-medium">Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View className="py-16 items-center px-6">
        <Icon
          name={variant === "saved" || variant === "folder" ? "Bookmark" : variant === "liked" ? "Heart" : variant === "unlocked" ? "LockOpen" : variant === "watched" ? "History" : "LayoutGrid"}
          size={48}
          color="#6b7280"
        />
        <Text className="text-theme-neutrals-400 text-base mt-4 text-center">
          {emptyMessage}
        </Text>
      </View>
    );
  }, [loading, error, variant, emptyMessage, loadPage]);

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
