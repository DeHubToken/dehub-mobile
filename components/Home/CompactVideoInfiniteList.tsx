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
import { resolveThumbnail } from "../../libs"; // keep minimal import if needed

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
  showCreator?: boolean; // forward to CompactVideoCard
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
  showCreator = true,
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

  const keyExtractor = useCallback((item: VideoItem, index: number) => {
    const created =
      (item as any).createdAt ||
      (item as any).stream?.createdAt ||
      (item as any).created_at ||
      "nocreated";
    return `${item.id || (item as any).tokenId || "vid"}-${created}-${index}`;
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<VideoItem>) => {
      return (
        <CompactVideoCard
          nft={item as any}
          enablePreview={resolvedEnablePreview}
          showCreator={showCreator}
        />
      );
    },
    [resolvedEnablePreview, showCreator]
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
