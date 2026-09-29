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
  View,
  Text,
} from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import FeedCard from "../Home/FeedCard";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
import { getMyPosts, getLikedPosts, getSavedPosts, getUnlockedPosts, getWatchHistory } from "../../services/user.service";
import { getFolderItems } from "../../services/bookmark.service";
import { GetNFTsResponse, GetNFTsResult } from "../../services/nft.service";
import { useTranslation } from "react-i18next";
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
const FOOTER_HEIGHT = 56;

const PostsInfiniteList: React.FC<PostsInfiniteListProps> = ({
  variant,
  pageSize = DEFAULT_PAGE_SIZE,
  bottomPadding = 0,
  folderId,
}) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<PostItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // A failed first page used to be swallowed by a console.warn, leaving items
  // empty — so a network error rendered "No posts yet", telling the user their
  // library was empty when the request had actually failed.
  const [error, setError] = useState(false);
  // A failed later page. Stops onEndReached from retrying on its own and puts
  // a Retry row in the footer instead of a spinner that never resolves.
  const [pageError, setPageError] = useState(false);
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
      setPageError(false);
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
        // page 2 keeps the already-rendered posts on screen and offers a
        // Retry row in the footer.
        if (targetPage === 0) setError(true);
        else setPageError(true);
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

  // No items: a failed first page would otherwise fire this as the error view
  // settles and load page 2 in its place, skipping the first 20 posts.
  // pageError: the footer swap would otherwise re-fire it in a loop offline.
  const onEndReached = useCallback(() => {
    if (!hasMore || pageError || items.length === 0 || loadingRef.current) return;
    loadPage(page + 1);
  }, [hasMore, pageError, items.length, page, loadPage]);

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

  const {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    isItemAutoplayActive,
    visibilityExtraData,
  } = useFeedCardVisibility(keyExtractor as (item: unknown, index: number) => string);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<PostItem>) => {
      return (
        <FeedCard
          item={item as any}
          // Without this FeedCard falls back to isVisible=true and every one
          // of the eleven windowed rows attaches its own native player.
          isVisible={isItemVisible(keyExtractor(item, index))}
          isAutoplayActive={isItemAutoplayActive(keyExtractor(item, index))}
          onCategorySelect={() => {}}
        />
      );
    },
    [isItemVisible, isItemAutoplayActive, keyExtractor]
  );

  // Nothing under the skeleton, empty or first-page error views. The spinner
  // and the Retry row share one fixed height so swapping them never changes
  // the content length (which would re-fire onEndReached and jump the list).
  const ListFooter = useMemo(() => {
    if (items.length === 0) return null;
    if (pageError) {
      return (
        <Pressable
          onPress={() => loadPage(page + 1)}
          accessibilityRole="button"
          className="flex-row items-center justify-center px-4 active:opacity-70"
          style={{ height: FOOTER_HEIGHT, gap: 8 }}
        >
          <Text
            className="text-theme-neutrals-400 text-sm"
            style={{ flexShrink: 1 }}
            numberOfLines={2}
          >
            {t("profile.couldNotLoadPosts")}
          </Text>
          <Text className="text-white text-sm font-medium">{t("common.retry")}</Text>
        </Pressable>
      );
    }
    if (!hasMore) return null;
    return (
      <View className="items-center justify-center" style={{ height: FOOTER_HEIGHT }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }, [hasMore, pageError, items.length, page, loadPage, t]);

  const emptyMessage = useMemo(() => {
    switch (variant) {
      case "liked":
        return t("profile.emptyLiked");
      case "saved":
        return t("profile.emptySaved");
      case "unlocked":
        return t("profile.emptyUnlocked");
      case "watched":
        return t("profile.emptyWatched");
      case "folder":
        return t("profile.emptyFolder");
      case "myPosts":
      default:
        return t("profile.emptyPosts");
    }
  }, [variant, t]);

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
          <Icon name="WifiOff" size={48} color="#808089" />
          <Text className="text-theme-neutrals-400 text-base mt-4 text-center">
            {t("profile.couldNotLoadPosts")}
          </Text>
          <Pressable
            // Show the skeleton while it retries; a replace load never sets it.
            onPress={() => {
              setLoading(true);
              loadPage(0, true);
            }}
            hitSlop={8}
            className="mt-4 rounded-xl px-4 justify-center items-center"
            style={{ height: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.30)" }}
          >
            <Text className="text-white text-sm font-medium">{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View className="py-16 items-center px-6">
        <Icon
          name={variant === "saved" || variant === "folder" ? "Bookmark" : variant === "liked" ? "Heart" : variant === "unlocked" ? "LockOpen" : variant === "watched" ? "History" : "LayoutGrid"}
          size={48}
          color="#808089"
        />
        <Text className="text-theme-neutrals-400 text-base mt-4 text-center">
          {emptyMessage}
        </Text>
      </View>
    );
  }, [loading, error, variant, emptyMessage, loadPage, t]);

  return (
    <View className="flex-1">
      <FlatList
      className="flex-1 bg-theme-neutrals-900"
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={ListFooter}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      // Was 11 — twenty-plus feed cards resident at once on a profile list.
      windowSize={7}
      removeClippedSubviews={false}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      extraData={visibilityExtraData}
      refreshControl={
        <DeHubRefreshControl
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
      showsVerticalScrollIndicator={false}
      />
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
};

export default PostsInfiniteList;
