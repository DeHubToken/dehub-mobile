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
import CompactVideoCard from "./CompactVideoCard";
import CompactVideoCardSkeleton from "./CompactVideoCardSkeleton";
import { getUserVideos, getUserLiveVideos } from "../../services/user.service";
import { GetNFTsResult } from "../../services/nft.service";
import { secondsToHMMSS } from "../../libs/date.util";
import {
  getAvatarUrl,
  resolveThumbnail,
  getImageUrl,
  getBadgeUrl,
} from "../../libs";

const DEFAULT_BANNER = require("../../assets/default-banner.png");
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

interface CompactVideoInfiniteListProps {
  address: string; // user address to fetch videos for
  pageSize?: number;
  enablePreview?: boolean; // preview disabled automatically for live unless forced
  onLoadedFirstPage?: (count: number) => void;
  bottomPadding?: number; // extra bottom inset (e.g., tab bar height)
  variant?: "videos" | "live";
  ListHeaderComponent?: React.ReactElement | null;
}

interface VideoItem extends GetNFTsResult {}

const DEFAULT_PAGE_SIZE = 40;

const CompactVideoInfiniteList: React.FC<CompactVideoInfiniteListProps> = ({
  address,
  pageSize = DEFAULT_PAGE_SIZE,
  enablePreview,
  onLoadedFirstPage,
  bottomPadding = 0,
  variant = "videos",
  ListHeaderComponent = null,
}) => {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);

  const fetcher = useCallback(
    (addr: string, opts: { page: number; unit: number }) => {
      return variant === "live"
        ? getUserLiveVideos(addr, opts as any)
        : getUserVideos(addr, opts as any);
    },
    [variant]
  );

  const resolvedEnablePreview = enablePreview ?? variant !== "live";

  const loadPage = useCallback(
    async (targetPage: number, replace = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (targetPage === 0 && !replace) setLoading(true);
      try {
        const res = await fetcher(address, {
          page: targetPage,
          unit: pageSize,
        });
        const newItems = res?.result || [];
        setHasMore(newItems.length === pageSize);
        setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setPage(targetPage);
        if (targetPage === 0 && onLoadedFirstPage)
          onLoadedFirstPage(newItems.length);
      } catch (e) {
        console.warn("[CompactVideoInfiniteList] loadPage error", e);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [address, pageSize, onLoadedFirstPage, fetcher]
  );

  useEffect(() => {
    loadPage(0, true);
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadPage(page + 1);
  }, [hasMore, page, loadPage]);

  const onRefresh = useCallback(() => {
    // For pull-to-refresh we want to show skeletons again, so clear items and set loading.
    setRefreshing(true);
    setLoading(true);
    setItems([]); // triggers ListEmptyComponent skeletons
    loadPage(0, true);
  }, [loadPage]);

  const keyExtractor = useCallback(
    (item: VideoItem, index: number) =>
      `${item.id || item.tokenId || "vid"}-${index}`,
    []
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<VideoItem>) => {
      const duration = item.videoDuration
        ? secondsToHMMSS(item.videoDuration)
        : undefined;
      // Stream / account resolution (support legacy shapes)
      const streamInfo =
        (item as any).streamInfo || (item as any).stream?.streamInfo;
      const tokenId = item.tokenId || (item as any).stream?.tokenId;
      const status: string | undefined =
        (item as any).status ||
        ((item as any).meta?.isActive === false && (item as any).streamKey)
          ? "ENDED"
          : undefined;
      const isLive = !!(item as any).streamKey || !!streamInfo?.isLive;
      // Thumbnail resolution (live vs recorded) mimicking InfiniteVideoFeed logic
      const rawThumb =
        (item as any).thumbnail ||
        (item as any).stream?.thumbnail ||
        item.thumbnailUrl ||
        item.imageUrl ||
        "";
      const thumbUrl = isLive
        ? resolveThumbnail(item as any)
        : getImageUrl(rawThumb, 640, 360);
      const thumb = thumbUrl && thumbUrl.length > 0 ? thumbUrl : DEFAULT_BANNER;
      // Avatar & badge
      const avatarUrl = getAvatarUrl((item as any).minterAvatarUrl || "");
      const avatar =
        avatarUrl && avatarUrl !== "default-avatar"
          ? avatarUrl
          : DEFAULT_AVATAR;
      const stakeForBadge = (item as any).minterStaked || 0;
      const badgeImage = getBadgeUrl(stakeForBadge, "dark");
      // Title & creator
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
      const creatorUsername =
        (item as any).account?.username ||
        (item as any).mintername ||
        undefined;
      const creatorAddress =
        (item as any).account?.address ||
        (item as any).minter ||
        (item as any).owner ||
        undefined;
      // Likes / Views
      const likes =
        item.likes ||
        (item as any).totalVotes?.for ||
        (item as any).stream?.likes ||
        0;
      const views =
        item.views ||
        (item as any).peakViewers ||
        (item as any).totalViews ||
        (item as any).stream?.totalViews ||
        0;
      // createdAt fallback
      const createdAt =
        item.createdAt ||
        (item as any).stream?.createdAt ||
        new Date().toISOString();
      // Flags
      const isBounty = !!streamInfo?.isAddBounty;
      const bountyAmount = streamInfo?.addBountyAmount;
      const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol;
      return (
        <CompactVideoCard
          id={(item as any).id || tokenId}
          tokenId={tokenId as any}
          title={title}
          views={views}
          createdAt={createdAt}
          thumbnail={thumb as any}
          likes={likes}
          duration={duration}
          enablePreview={resolvedEnablePreview}
          isLive={isLive}
          isPayPerView={streamInfo?.isPayPerView}
          payPerViewAmount={streamInfo?.payPerViewAmount}
          payPerViewTokenSymbol={streamInfo?.payPerViewTokenSymbol}
          isLocked={streamInfo?.isLockContent}
          lockContentAmount={streamInfo?.lockContentAmount}
          lockContentTokenSymbol={streamInfo?.lockContentTokenSymbol}
          isBounty={isBounty}
          bountyAmount={bountyAmount}
          bountyTokenSymbol={bountyTokenSymbol}
          creator={creatorName}
          username={creatorUsername}
          address={creatorAddress}
          badgeImage={badgeImage}
          status={status as any}
        />
      );
    },
    [resolvedEnablePreview]
  );

  const ListFooter = useMemo(() => {
    if (!hasMore) return null;
    return (
      <View className="py-4 items-center">
        <ActivityIndicator color="#fff" />
      </View>
    );
  }, [hasMore]);

  return (
    <FlatList
      className="flex-1 bg-theme-background"
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={ListFooter}
      initialNumToRender={10}
      windowSize={11}
      removeClippedSubviews
      ListHeaderComponent={ListHeaderComponent || undefined}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#fff"
        />
      }
      contentContainerStyle={{
        paddingVertical: 8,
        paddingBottom: bottomPadding,
      }}
      ListEmptyComponent={
        !loading ? (
          <View className="py-10 items-center">
            <Text className="text-theme-neutrals-300 text-sm">
              No videos found.
            </Text>
          </View>
        ) : (
          <View>
            {Array.from({ length: 6 }).map((_, i) => (
              <CompactVideoCardSkeleton key={`sk-${i}`} />
            ))}
          </View>
        )
      }
    />
  );
};

export default CompactVideoInfiniteList;
