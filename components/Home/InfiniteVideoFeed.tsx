import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ListRenderItem,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import EmptyFeedState from "./EmptyFeedState";
import VideoCard from "./VideoCard";
import VideoCardSkeleton from "./VideoCardSkeleton";
import {
  getNFTs,
  GetNFTsResult,
  SearchParams,
} from "../../services/nft.service";
import { secondsToHMMSS } from "../../libs/date.util";
import {
  getAvatarUrl,
  resolveThumbnail,
  getImageUrl,
  getBadgeUrl,
} from "../../libs";
import { theme } from "../../theme";

interface InfiniteVideoFeedProps {
  params?: Partial<SearchParams>; // any search params except page which we control
  pageSize?: number; // unit (default 10)
  contentContainerStyle?: any;
  onEndReachedAll?: () => void; // callback when no more pages
  onScrollDirectionChange?: (direction: "up" | "down", offsetY: number) => void; // notify parent
  onClearFilters?: () => void; // allow empty state clear
}

const DEFAULT_BANNER = require("../../assets/default-banner.png");
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

export const InfiniteVideoFeed: React.FC<InfiniteVideoFeedProps> = ({
  params,
  pageSize = 10,
  contentContainerStyle,
  onEndReachedAll,
  onScrollDirectionChange,
  onClearFilters,
}) => {
  interface FeedItem extends GetNFTsResult {
    __listKey: string;
  }
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  // Start as true so we don't briefly render the empty state before resetAndLoad sets loading
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const endReachedRef = useRef(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const prevYRef = useRef(0);
  const lastDirectionRef = useRef<"up" | "down" | null>(null);

  const resetAndLoad = useCallback(async () => {
    // show skeleton immediately
    setItems([]);
    setInitialLoading(true);
    setError(null);
    endReachedRef.current = false;
    setPage(0);
    try {
      const res = await getNFTs({ ...(params || {}), unit: pageSize, page: 0 });
      const mapped: FeedItem[] = (res.result || []).map((it, idx) => {
        // Always include page + index to guarantee uniqueness even if backend returns duplicate ids
        const base =
          (it as any).tokenId ||
          (it as any).id ||
          (it as any).nftId ||
          (it as any).streamKey ||
          (it as any).stream?.id ||
          (it as any).stream?.streamKey ||
          `auto`; // fallback
        const created =
          (it as any).createdAt ||
          (it as any).stream?.createdAt ||
          (it as any).created_at ||
          `nocreated`;
        return {
          ...it,
          __listKey: `${base}-${created}-p0-i${idx}`,
        };
      });
      setItems(mapped);
      if (!res.result || res.result.length < pageSize) {
        endReachedRef.current = true;
        onEndReachedAll && onEndReachedAll();
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setInitialLoading(false);
    }
  }, [params, pageSize, onEndReachedAll]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  const loadMore = useCallback(async () => {
    if (initialLoading || loadingMore || refreshing) return;
    if (endReachedRef.current) return; // hard stop
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await getNFTs({
        ...(params || {}),
        unit: pageSize,
        page: nextPage,
      });
      const newItems = (res.result || []).map((it, idx) => {
        const base =
          (it as any).tokenId ||
          (it as any).id ||
          (it as any).nftId ||
          (it as any).streamKey ||
          (it as any).stream?.id ||
          (it as any).stream?.streamKey ||
          `auto`;
        const created =
          (it as any).createdAt ||
          (it as any).stream?.createdAt ||
          (it as any).created_at ||
          `nocreated`;
        return {
          ...it,
          __listKey: `${base}-${created}-p${nextPage}-i${idx}`,
        };
      });
      setItems((prev) => [...prev, ...newItems]);
      setPage(nextPage);
      if (newItems.length < pageSize) {
        endReachedRef.current = true;
        onEndReachedAll && onEndReachedAll();
      }
    } catch (e) {
      // keep previous items; optionally set a load-more error state
    } finally {
      setLoadingMore(false);
    }
  }, [
    initialLoading,
    loadingMore,
    refreshing,
    page,
    params,
    pageSize,
    onEndReachedAll,
  ]);

  const onRefresh = useCallback(async () => {
    // Mirror behavior of compact list: clear items & show skeleton instantly.
    setRefreshing(true);
    setItems([]); // triggers skeleton placeholder when initialLoading flips
    setInitialLoading(true);
    await resetAndLoad();
    setRefreshing(false);
  }, [resetAndLoad]);

  const handleRetry = useCallback(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y > 400 && !showBackToTop) setShowBackToTop(true);
      else if (y <= 400 && showBackToTop) setShowBackToTop(false);

      const prevY = prevYRef.current;
      const delta = y - prevY;
      const threshold = 8;
      if (Math.abs(delta) > threshold) {
        const direction: "up" | "down" = delta > 0 ? "down" : "up";
        if (direction !== lastDirectionRef.current) {
          lastDirectionRef.current = direction;
          onScrollDirectionChange && onScrollDirectionChange(direction, y);
        }
        prevYRef.current = y;
      }
    },
    [showBackToTop, onScrollDirectionChange]
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderItem: ListRenderItem<FeedItem> = ({ item }) => {
    const duration = item.videoDuration
      ? secondsToHMMSS(item.videoDuration)
      : undefined;
    // Support two shapes: recorded video vs live stream (stream/account)
    const streamInfo = item.streamInfo || (item as any).stream?.streamInfo;
    const tokenId = item.tokenId || (item as any).stream?.tokenId;
    const rawStatus: string | undefined = (item as any).status;
    const status = rawStatus ? rawStatus.toUpperCase() : undefined;
    const isLive = !!(item as any).streamKey || !!streamInfo?.isLive;

    const rawThumb =
      (item as any).thumbnail ||
      (item as any).stream?.thumbnail ||
      item.thumbnailUrl ||
      item.imageUrl ||
      "";
    const thumbUrl = isLive
      ? resolveThumbnail(item)
      : getImageUrl(rawThumb, 640, 360);
    const thumb = thumbUrl && thumbUrl.length > 0 ? thumbUrl : DEFAULT_BANNER;
    const avatarUrl = getAvatarUrl(
      (item as any).minterAvatarUrl ||
        (item as any).account?.avatarImageUrl ||
        ""
    );
    const avatar =
      avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : DEFAULT_AVATAR;
    const stakeForBadge = (item as any).minterStaked || 0;
    const badgeImage = getBadgeUrl(stakeForBadge, "dark");
    const title =
      (item as any).name ||
      (item as any).title ||
      (item as any).stream?.title ||
      "Untitled";
    const creatorName =
      (item as any).minterDisplayName ||
      (item as any).mintername ||
      (item as any).minter ||
      (item as any).owner ||
      (item as any).account.displayName ||
      (item as any).account.username ||
      (item as any).account.address ||
      "Unknown";
    const likes =
      item.likes || item.totalVotes?.for || (item as any).stream?.likes || 0;
    const views =
      item.views ||
      (item as any).peakViewers ||
      item.totalViews ||
      (item as any).stream?.totalViews ||
      0;
    const createdAt =
      item.createdAt ||
      (item as any).stream?.createdAt ||
      new Date().toISOString();
    const isBounty = !!streamInfo?.isAddBounty;
    const bountyAmount = streamInfo?.addBountyAmount;
    const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol;
  const creatorUsername = (item as any).account?.username || (item as any).mintername || undefined;
  const creatorAddress = (item as any).account?.address || (item as any).minter || (item as any).owner || undefined;
  return (<VideoCard nft={item as any} enablePreview />);
  };

  const keyExtractor = useCallback((item: FeedItem) => item.__listKey, []);

  if (initialLoading && items.length === 0) {
    return (
      <View className="flex-1 px-2 pt-2">
        <VideoCardSkeleton count={4} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          className="px-5 py-2 rounded-md bg-theme-neutrals-700 active:opacity-80"
        >
          <Text className="text-theme-neutrals-50 font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
        updateCellsBatchingPeriod={80}
        contentContainerStyle={
          contentContainerStyle || {
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 80,
          }
        }
        onEndReached={endReachedRef.current ? undefined : loadMore}
        onEndReachedThreshold={0.4}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentForeground}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="px-2 pt-2">
              <VideoCardSkeleton count={2} />
            </View>
          ) : endReachedRef.current && items.length > 0 ? (
            <View className="px-4 py-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">
                No more videos
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !initialLoading && !error ? (
            <EmptyFeedState
              message="No videos match your filters"
              onClear={onClearFilters}
              clearLabel="Clear Filters"
            />
          ) : null
        }
      />
      {showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          className="absolute bottom-6 right-5 bg-theme-neutrals-800/80 rounded-full p-3 active:opacity-80"
        >
          <Ionicons
            name="chevron-up"
            size={22}
            color={theme.colors.accentForeground || "#fff"}
          />
        </Pressable>
      )}
    </View>
  );
};

export default InfiniteVideoFeed;
