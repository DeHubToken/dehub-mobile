import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import {
  getUserReplies,
  type UserReplyItem,
  type UserRepliesPagination,
} from "../../services/user.service";
import { getNFT } from "../../services/nft.service";
import {
  needsReplyPostEnrichment,
  nftToReplyPost,
} from "../../libs/replyPostDisplay";
import UserReplyCard from "./UserReplyCard";


interface UserRepliesListProps {
  address: string;
  /** Horizontal padding for each row. */
  contentPadding: number;
  scrollEnabled?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** FlatList header (profile header + tab bar in fullscreen mode). */
  headerComponent?: React.ReactNode;
  contentContainerStyle?: Record<string, unknown>;
  /** Called when a reply card is tapped — navigate to the post. */
  onItemPress: (item: UserReplyItem) => void;
  /** Called on long-press of a reply card. */
  onItemLongPress?: (item: UserReplyItem) => void;
}

export interface UserRepliesListRef {
  scrollToOffset: (params: { offset: number; animated: boolean }) => void;
}

const PAGE_SIZE = 20;

async function enrichReplyItems(items: UserReplyItem[]): Promise<UserReplyItem[]> {
  const tokenIds = new Set<number>();
  for (const item of items) {
    const tokenId = item.post?.tokenId ?? item.tokenId;
    if (!tokenId) continue;
    if (needsReplyPostEnrichment(item.post, tokenId)) {
      tokenIds.add(tokenId);
    }
  }
  if (tokenIds.size === 0) return items;

  const postByTokenId = new Map<number, UserReplyItem["post"]>();
  await Promise.all(
    [...tokenIds].map(async (tokenId) => {
      try {
        const res = await getNFT(tokenId);
        postByTokenId.set(tokenId, nftToReplyPost(res.result ?? {}, tokenId));
      } catch {
        // keep lightweight post context from comments API
      }
    }),
  );

  if (postByTokenId.size === 0) return items;

  return items.map((item) => {
    const tokenId = item.post?.tokenId ?? item.tokenId;
    const enriched = tokenId ? postByTokenId.get(tokenId) : undefined;
    if (!enriched) return item;
    // full NFT data wins, but don't let undefined fields wipe out comments-API values
    const definedEnriched = Object.fromEntries(
      Object.entries(enriched).filter(([, v]) => v !== undefined),
    );
    return {
      ...item,
      post: {
        ...item.post,
        ...definedEnriched,
        tokenId,
      },
    };
  });
}


const UserRepliesListInner: React.ForwardRefRenderFunction<
  UserRepliesListRef,
  UserRepliesListProps
> = (
  {
    address,
    contentPadding,
    scrollEnabled,
    onScroll,
    headerComponent,
    contentContainerStyle,
    onItemPress,
    onItemLongPress,
  },
  ref,
) => {
  const listRef = useRef<FlatList<UserReplyItem>>(null);
  const [items, setItems] = useState<UserReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paginationRef = useRef<UserRepliesPagination | null>(null);
  const pageRef = useRef(1);

  // Expose scroll control to parent
  useImperativeHandle(ref, () => ({
    scrollToOffset: (params) => listRef.current?.scrollToOffset(params),
  }));


  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      const res = await getUserReplies({ address, page, limit: PAGE_SIZE });
      const enrichedItems = await enrichReplyItems(res.result.items);
      paginationRef.current = res.result.pagination;
      pageRef.current = page;
      if (replace) {
        setItems(enrichedItems);
      } else {
        setItems((prev) => [...prev, ...enrichedItems]);
      }
    },
    [address],
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(1, true)
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load replies");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPage(1, true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Refresh failed";
      setError(msg);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  // Infinite scroll
  const handleEndReached = useCallback(async () => {
    if (loadingMore || loading) return;
    if (!paginationRef.current?.hasMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(pageRef.current + 1, false);
    } catch {
      // keep existing items
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, fetchPage]);


  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<UserReplyItem>) => (
      <View style={{ paddingHorizontal: contentPadding }}>
        <UserReplyCard
          item={item}
          onPress={onItemPress}
          onLongPress={onItemLongPress}
        />
      </View>
    ),
    [contentPadding, onItemPress, onItemLongPress],
  );

  const keyExtractor = useCallback(
    (item: UserReplyItem) => `reply-${item.id}-${item.createdAt}`,
    [],
  );


  // Initial loading
  if (loading && items.length === 0) {
    return (
      <View className="flex-1">
        {!!headerComponent && <View>{headerComponent}</View>}
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  // Error state
  if (error && items.length === 0) {
    return (
      <View className="flex-1">
        {!!headerComponent && <View>{headerComponent}</View>}
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-theme-neutrals-400 text-sm mb-3">{error}</Text>
          <View className="px-5 py-2 rounded-xl bg-theme-neutrals-700">
            <Text
              onPress={handleRefresh}
              className="text-theme-neutrals-50 font-medium text-sm"
            >
              Retry
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Empty state
  if (!loading && items.length === 0) {
    return (
      <View className="flex-1">
        {!!headerComponent && <View>{headerComponent}</View>}
        <View className="flex-1 items-center justify-center px-8 py-16">
          <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
            <Ionicons name="chatbubbles-outline" size={40} color="#666" />
          </View>
          <Text className="text-white text-lg font-bold text-center mb-2">
            No Replies Yet
          </Text>
          <Text className="text-gray-400 text-center text-sm leading-5">
            When this user replies to posts, they'll show up here.
          </Text>
        </View>
      </View>
    );
  }


  return (
    <FlatList
      ref={listRef}
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      scrollEnabled={scrollEnabled}
      onScroll={onScroll}
      scrollEventThrottle={16}
      ListHeaderComponent={headerComponent as React.ReactElement | null}
      contentContainerStyle={contentContainerStyle}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={7}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.accentForeground}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : !paginationRef.current?.hasMore && items.length > 0 ? (
          <View className="px-4 py-6 items-center">
            <Text className="text-theme-neutrals-400 text-xs">No more replies</Text>
          </View>
        ) : null
      }
    />
  );
};

export const UserRepliesList = forwardRef(UserRepliesListInner);
export default UserRepliesList;
