import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Text,
  RefreshControl,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import FeedCard from "../Home/FeedCard";
import {
  getUnifiedFeed,
  type UnifiedFeedItem,
} from "../../services/feed.unified.service";
import { getUserReposts } from "../../services/repost.service";
import { theme } from "../../theme";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";

const PAGE_SIZE = 20;
const MAX_REPOST_PAGES = 10;

type PostRow = {
  key: string;
  createdAt: string;
  item: UnifiedFeedItem;
  isRepost: boolean;
};

interface PostsRouteProps {
  address?: string;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactNode;
  scrollEnabled?: boolean;
  /** Called right before a card navigates away (e.g. to close an enclosing sheet). */
  onBeforeNavigate?: () => void;
}

/**
 * Profile "Posts" tab — all of the user's own content (text, images, videos,
 * audio) merged with their reposts, matching the web profile's main feed.
 * Comments/replies live in the Replies tab.
 */
const PostsRoute: React.FC<PostsRouteProps> = ({
  address,
  onScroll,
  listHeader,
  scrollEnabled = true,
  onBeforeNavigate,
}) => {
  const [posts, setPosts] = useState<UnifiedFeedItem[]>([]);
  const [reposts, setReposts] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const postPageRef = useRef(0);
  const postEndRef = useRef(false);

  const loadReposts = useCallback(async (addr: string) => {
    let page = 1;
    let all: UnifiedFeedItem[] = [];
    let hasMore = true;
    while (hasMore && page <= MAX_REPOST_PAGES) {
      const res = await getUserReposts({ address: addr, page, limit: 50 });
      const batch = (res.result || []).map((item: any) => ({
        ...item,
        isRepost: true,
        postType: item.postType || "feed-simple",
      })) as UnifiedFeedItem[];
      all = [...all, ...batch];
      hasMore = res.pagination?.hasMore ?? batch.length >= 50;
      page += 1;
    }
    return all;
  }, []);

  const loadPostsPage = useCallback(async (addr: string, page: number, append: boolean) => {
    // No postType filter — the web profile's main feed shows ALL of the
    // user's content (text, images, videos, audio) merged with reposts, so a
    // profile with only media posts must not read as empty here.
    const res = await getUnifiedFeed({
      minter: addr,
      sortBy: "createdAt",
      sortOrder: "desc",
      status: "minted",
      page: page + 1,
      limit: PAGE_SIZE,
    });
    const batch = res.result || [];
    setPosts((prev) => (append ? [...prev, ...batch] : batch));
    postPageRef.current = page;
    postEndRef.current = batch.length < PAGE_SIZE;
  }, []);

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (!address) {
        setPosts([]);
        setReposts([]);
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      postEndRef.current = false;
      postPageRef.current = 0;
      // Load posts and reposts independently — a failure in one must not wipe
      // the other. Previously a rejected reposts call rejected the shared
      // Promise.all and the catch cleared the already-loaded posts to [], so the
      // profile read as empty until a refresh (which doesn't clear on error).
      const postsPromise = loadPostsPage(address, 0, false).catch((e) => {
        console.warn("[PostsRoute] posts load failed", e);
        if (!isRefresh) setPosts([]);
      });
      const repostsPromise = loadReposts(address)
        .then((rows) => setReposts(rows))
        .catch((e) => {
          console.warn("[PostsRoute] reposts load failed", e);
          if (!isRefresh) setReposts([]);
        });
      try {
        await Promise.all([postsPromise, repostsPromise]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [address, loadPostsPage, loadReposts],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadMorePosts = useCallback(async () => {
    if (!address || loadingMore || postEndRef.current || loading) return;
    setLoadingMore(true);
    try {
      await loadPostsPage(address, postPageRef.current + 1, true);
    } finally {
      setLoadingMore(false);
    }
  }, [address, loadingMore, loading, loadPostsPage]);

  const merged = useMemo<PostRow[]>(() => {
    const ownIds = new Set(
      posts.map((p) => String(p.tokenId ?? p.id ?? "")).filter(Boolean),
    );
    const rows: PostRow[] = [
      ...posts.map((post) => ({
        key: `own-${post.tokenId ?? post.id}`,
        createdAt: post.createdAt || "",
        item: post,
        isRepost: false,
      })),
      ...reposts
        .filter((r) => {
          const id = String(r.tokenId ?? r.id ?? "");
          return id && !ownIds.has(id);
        })
        .map((item) => ({
          key: `repost-${item.tokenId ?? item.id}-${(item as any).repostedAt ?? item.createdAt}`,
          createdAt: (item as any).repostedAt || item.createdAt || "",
          item,
          isRepost: true,
        })),
    ];
    rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return rows;
  }, [posts, reposts]);

  // Without this every windowed row rendered with FeedCard's `isVisible`
  // default of true, so a profile with videos attached a native player per row.
  const rowKeyExtractor = useCallback((row: { key: string }) => row.key, []);
  const {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    visibilityExtraData,
  } = useFeedCardVisibility();

  const renderRow = useCallback(
    ({ item }: { item: (typeof merged)[number] }) => (
      <FeedCard
        item={item.item}
        showRepostLabel={item.isRepost}
        isVisible={isItemVisible(item.key, item.item)}
        onBeforeNavigate={onBeforeNavigate}
      />
    ),
    [isItemVisible, onBeforeNavigate],
  );

  if (loading) {
    return (
      <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View className="items-center justify-center py-10">
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </ScrollView>
    );
  }

  if (merged.length === 0) {
    return (
      <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View className="items-center justify-center px-8 py-16">
          <Text className="text-theme-neutrals-400 text-sm text-center">
            No posts yet
          </Text>
        </View>
      </ScrollView>
    );
  }

  // The header must be passed as an element (not an inline component) so it
  // reconciles instead of remounting on every render — remounts re-measure the
  // header and leave a blank gap when scrolling back up.
  const headerElement = listHeader ? <>{listHeader}</> : undefined;

  return (
    <View className="flex-1 px-3">
      <FlatList
        data={merged}
        keyExtractor={rowKeyExtractor}
        ListHeaderComponent={headerElement}
        scrollEnabled={scrollEnabled}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CONTENT_INSET, paddingTop: 8 }}
        windowSize={7}
        maxToRenderPerBatch={4}
        initialNumToRender={4}
        removeClippedSubviews
        onScroll={onScroll}
        scrollEventThrottle={16}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        extraData={visibilityExtraData}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAll(true);
            }}
            tintColor={theme.colors.accent}
          />
        }
        onEndReached={loadMorePosts}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View className="py-4 items-center">
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
      />
    </View>
  );
};

export default PostsRoute;
