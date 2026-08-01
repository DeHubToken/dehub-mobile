import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import FeedCard from "../Home/FeedCard";
import UserReplyCard from "../UserProfile/UserReplyCard";
import {
  getUnifiedFeed,
  type UnifiedFeedItem,
} from "../../services/feed.unified.service";
import { getUserReplies, type UserReplyItem } from "../../services/user.service";
import { theme } from "../../theme";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { ScreenNames } from "../../navigation/ScreenNames";
import ProfileEmptyState from "./ProfileEmptyState";

const PAGE_SIZE = 20;
const MAX_REPLY_PAGES = 10;

type ProfilePostRow =
  | {
      kind: "post";
      key: string;
      createdAt: string;
      item: UnifiedFeedItem;
    }
  | {
      kind: "reply";
      key: string;
      createdAt: string;
      item: UserReplyItem;
    };

interface PostsRouteProps {
  address?: string;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactNode;
  scrollEnabled?: boolean;
  /** Called right before a card navigates away (e.g. to close an enclosing sheet). */
  onBeforeNavigate?: () => void;
}

/** Web-parity Posts tab: text posts merged with comments and replies. */
const PostsRoute: React.FC<PostsRouteProps> = ({
  address,
  onScroll,
  listHeader,
  scrollEnabled = true,
  onBeforeNavigate,
}) => {
  const navigation = useNavigation<any>();
  const [posts, setPosts] = useState<UnifiedFeedItem[]>([]);
  const [replies, setReplies] = useState<UserReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const postPageRef = useRef(0);
  const postEndRef = useRef(false);

  const loadReplies = useCallback(async (profileAddress: string) => {
    let page = 1;
    let all: UserReplyItem[] = [];
    let hasMore = true;
    while (hasMore && page <= MAX_REPLY_PAGES) {
      const response = await getUserReplies({
        address: profileAddress,
        page,
        limit: 50,
      });
      const batch = response.result.items || [];
      all = [...all, ...batch];
      hasMore = response.result.pagination?.hasMore ?? batch.length >= 50;
      page += 1;
    }
    return all;
  }, []);

  const loadPostsPage = useCallback(
    async (profileAddress: string, page: number, append: boolean) => {
      const response = await getUnifiedFeed({
        minter: profileAddress,
        postType: "feed-simple",
        sortBy: "createdAt",
        sortOrder: "desc",
        status: "minted",
        page: page + 1,
        limit: PAGE_SIZE,
      });
      const batch = response.result || [];
      setPosts((previous) => (append ? [...previous, ...batch] : batch));
      postPageRef.current = page;
      postEndRef.current = batch.length < PAGE_SIZE;
    },
    [],
  );

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (!address) {
        setPosts([]);
        setReplies([]);
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      postEndRef.current = false;
      postPageRef.current = 0;

      const postsPromise = loadPostsPage(address, 0, false).catch((error) => {
        console.warn("[PostsRoute] posts load failed", error);
        if (!isRefresh) setPosts([]);
      });
      const repliesPromise = loadReplies(address)
        .then(setReplies)
        .catch((error) => {
          console.warn("[PostsRoute] comments load failed", error);
          if (!isRefresh) setReplies([]);
        });
      try {
        await Promise.all([postsPromise, repliesPromise]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [address, loadPostsPage, loadReplies],
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

  const merged = useMemo<ProfilePostRow[]>(() => {
    const rows: ProfilePostRow[] = [
      ...posts.map((post) => ({
        kind: "post" as const,
        key: `post-${post.tokenId ?? post.id}`,
        createdAt: post.createdAt || "",
        item: post,
      })),
      ...replies.map((reply) => ({
        kind: "reply" as const,
        key: `reply-${reply.id}-${reply.createdAt}`,
        createdAt: reply.createdAt || "",
        item: reply,
      })),
    ];
    rows.sort(
      (first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
    return rows;
  }, [posts, replies]);

  const rowKeyExtractor = useCallback((row: ProfilePostRow) => row.key, []);
  const {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    visibilityExtraData,
  } = useFeedCardVisibility();

  const renderRow = useCallback(
    ({ item }: { item: ProfilePostRow }) => {
      if (item.kind === "reply") {
        return (
          <UserReplyCard
            item={item.item}
            onPress={(reply) => {
              const tokenId = reply.tokenId ?? reply.post?.tokenId;
              if (!tokenId) return;
              onBeforeNavigate?.();
              navigation.navigate(ScreenNames.FeedDetail, {
                tokenId: String(tokenId),
                commentId: String(reply.id),
              });
            }}
          />
        );
      }
      return (
        <FeedCard
          item={item.item}
          isVisible={isItemVisible(item.key, item.item)}
          onBeforeNavigate={onBeforeNavigate}
        />
      );
    },
    [isItemVisible, navigation, onBeforeNavigate],
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
        <ProfileEmptyState
          kind="posts"
          title="No posts, comments, or replies yet"
          subtitle="They will appear here"
        />
      </ScrollView>
    );
  }

  const headerElement = listHeader ? <>{listHeader}</> : undefined;

  return (
    <View className="flex-1 px-3">
      <FlatList
        data={merged}
        keyExtractor={rowKeyExtractor}
        ListHeaderComponent={headerElement}
        scrollEnabled={scrollEnabled}
        renderItem={renderRow}
        contentContainerStyle={{
          paddingBottom: TAB_BAR_CONTENT_INSET,
          paddingTop: 8,
        }}
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
