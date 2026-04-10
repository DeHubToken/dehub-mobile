import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  StyleSheet,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { getUnifiedFeed } from "../../services/feed.unified.service";
import type { UnifiedFeedItem, UnifiedFeedParams } from "../../services/feed.unified.service";
import { getImageUrl, getImageUrlApiSimple } from "../../libs";
import { ScreenNames } from "../../navigation/ScreenNames";
import { theme } from "../../theme";

export interface HomeImageGridHandle {
  scrollToTopAndRefresh: () => void;
}

interface HomeImageGridProps {
  params?: Partial<UnifiedFeedParams>;
  pageSize?: number;
  gridRef?: React.MutableRefObject<HomeImageGridHandle | null>;
  headerInset?: number;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onScrollBegin?: () => void;
  onRefresh?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_PADDING = 16;
const GRID_WIDTH = SCREEN_WIDTH - GRID_PADDING;
const SMALL_SIZE = (GRID_WIDTH - GRID_GAP * 2) / 3;
const BIG_SIZE = SMALL_SIZE * 2 + GRID_GAP;

const ROW_HEIGHTS = [
  BIG_SIZE + GRID_GAP,
  BIG_SIZE + GRID_GAP,
  SMALL_SIZE + GRID_GAP,
];
const PATTERN_HEIGHT = ROW_HEIGHTS[0] + ROW_HEIGHTS[1] + ROW_HEIGHTS[2];

interface GridItemProps {
  item: UnifiedFeedItem;
  index: number;
  size: number;
  onPress: (index: number) => void;
}

const GridItem = memo<GridItemProps>(({ item, index, size, onPress }) => {
  const imageUri = useMemo(() => {
    const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    if (urls.length > 0) return getImageUrlApiSimple(urls[0]);
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
    return single || null;
  }, [item.imageUrls, item.imageUrl, item.thumbnailUrl]);

  const hasMultiple = (item.imageUrls?.length ?? 0) > 1;
  const handlePress = useCallback(() => onPress(index), [onPress, index]);

  if (!imageUri) return <View style={{ width: size, height: size, backgroundColor: "#262626" }} />;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={{ width: size, height: size, backgroundColor: "#262626" }}
    >
      <Image
        source={imageUri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={`home-grid-${item.tokenId || item.id}`}
        transition={150}
      />
      {hasMultiple && (
        <View style={styles.multipleImagesIcon}>
          <Icon name="Copy" size={16} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item.tokenId === next.item.tokenId &&
  prev.size === next.size &&
  prev.index === next.index
);

interface GridRowData {
  key: string;
  rowType: 0 | 1 | 2;
  startIndex: number;
}

const buildGridRows = (count: number): GridRowData[] => {
  const rows: GridRowData[] = [];
  let index = 0;
  let rowNum = 0;
  while (index < count) {
    const rowType = (rowNum % 3) as 0 | 1 | 2;
    rows.push({ key: `hgr-${rowNum}`, rowType, startIndex: index });
    index += 3;
    rowNum++;
  }
  return rows;
};

interface GridRowProps {
  row: GridRowData;
  data: UnifiedFeedItem[];
  onItemPress: (index: number) => void;
}

const GridRow = memo<GridRowProps>(({ row, data, onItemPress }) => {
  const { rowType, startIndex } = row;
  const a = data[startIndex];
  const b = data[startIndex + 1];
  const c = data[startIndex + 2];

  if (rowType === 0) {
    return (
      <View style={styles.patternRow}>
        {a && <GridItem item={a} index={startIndex} size={BIG_SIZE} onPress={onItemPress} />}
        <View style={styles.stackedColumn}>
          {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
          {c && <GridItem item={c} index={startIndex + 2} size={SMALL_SIZE} onPress={onItemPress} />}
        </View>
      </View>
    );
  }
  if (rowType === 1) {
    return (
      <View style={styles.patternRow}>
        <View style={styles.stackedColumn}>
          {a && <GridItem item={a} index={startIndex} size={SMALL_SIZE} onPress={onItemPress} />}
          {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
        </View>
        {c && <GridItem item={c} index={startIndex + 2} size={BIG_SIZE} onPress={onItemPress} />}
      </View>
    );
  }
  return (
    <View style={styles.equalRow}>
      {a && <GridItem item={a} index={startIndex} size={SMALL_SIZE} onPress={onItemPress} />}
      {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
      {c && <GridItem item={c} index={startIndex + 2} size={SMALL_SIZE} onPress={onItemPress} />}
    </View>
  );
});

const GridSkeleton: React.FC = () => (
  <View style={{ opacity: 0.6 }}>
    {[0, 1].map((p) => (
      <React.Fragment key={p}>
        <View style={styles.patternRow}>
          <View style={[styles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
          <View style={styles.stackedColumn}>
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          </View>
        </View>
        <View style={styles.patternRow}>
          <View style={styles.stackedColumn}>
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          </View>
          <View style={[styles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
        </View>
        <View style={styles.equalRow}>
          <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        </View>
      </React.Fragment>
    ))}
  </View>
);

const getGridItemLayout = (_data: any, index: number) => {
  const patternGroup = Math.floor(index / 3);
  const rowInPattern = index % 3;
  const offset =
    patternGroup * PATTERN_HEIGHT +
    (rowInPattern >= 1 ? ROW_HEIGHTS[0] : 0) +
    (rowInPattern >= 2 ? ROW_HEIGHTS[1] : 0);
  return { length: ROW_HEIGHTS[rowInPattern], offset, index };
};

const HomeImageGrid: React.FC<HomeImageGridProps> = ({
  params,
  pageSize = 20,
  gridRef,
  headerInset = 0,
  onScrollOffset,
  onScrollEnd,
  onScrollBegin,
  onRefresh: onRefreshProp,
}) => {
  const [items, setItems] = useState<UnifiedFeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endReachedRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  const prevYRef = useRef(0);
  const navigation = useNavigation<any>();

  useScrollToTop(listRef);

  const mergedParams = useMemo(() => ({
    ...(params || {}),
    postType: "feed-images" as const,
  }), [params]);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    endReachedRef.current = false;
    setPage(1);
    const res = await getUnifiedFeed({ ...mergedParams, limit: pageSize, page: 1 });
    setItems(res.result || []);
    if (!res.result || res.result.length < pageSize || !res.pagination?.hasMore) {
      endReachedRef.current = true;
    }
  }, [mergedParams, pageSize]);

  const resetAndLoad = useCallback(async () => {
    setItems([]);
    setInitialLoading(true);
    try {
      await loadFirstPage();
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setInitialLoading(false);
    }
  }, [loadFirstPage]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  const loadMore = useCallback(async () => {
    if (initialLoading || loadingMore || refreshing || endReachedRef.current) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await getUnifiedFeed({ ...mergedParams, limit: pageSize, page: nextPage });
      const newItems = res.result || [];
      setItems((prev) => [...prev, ...newItems]);
      setPage(nextPage);
      if (newItems.length < pageSize || !res.pagination?.hasMore) {
        endReachedRef.current = true;
      }
    } catch {
      // keep existing items
    } finally {
      setLoadingMore(false);
    }
  }, [initialLoading, loadingMore, refreshing, page, mergedParams, pageSize]);

  const onRefresh = useCallback(async () => {
    onRefreshProp?.();
    setRefreshing(true);
    try {
      await loadFirstPage();
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, [loadFirstPage, onRefreshProp]);

  useEffect(() => {
    if (!gridRef) return;
    gridRef.current = {
      scrollToTopAndRefresh: () => {
        onRefresh();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    };
  }, [gridRef, onRefresh]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const prevY = prevYRef.current;
      const delta = y - prevY;
      prevYRef.current = y;
      onScrollOffset?.(y, delta);
    },
    [onScrollOffset],
  );

  const handleGridItemPress = useCallback((index: number) => {
    const item = items[index];
    if (!item) return;
    const id = item.tokenId ?? item.id;
    if (id != null) {
      navigation.navigate(ScreenNames.FeedDetail as any, { postId: String(id) });
    }
  }, [items, navigation]);

  const gridRows = useMemo(() => buildGridRows(items.length), [items.length]);

  const renderGridRow = useCallback(
    ({ item: row }: { item: GridRowData }) => (
      <GridRow row={row} data={items} onItemPress={handleGridItemPress} />
    ),
    [items, handleGridItemPress],
  );

  const keyExtractor = useCallback((item: GridRowData) => item.key, []);

  if (initialLoading) {
    return (
      <View className="flex-1 px-2 pt-1">
        <View className="rounded-xl overflow-hidden">
          <GridSkeleton />
        </View>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <TouchableOpacity onPress={resetAndLoad} className="px-5 py-2 rounded-full bg-theme-neutrals-700">
          <Text className="text-theme-neutrals-50 font-medium">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2">
      <FlatList
        ref={listRef}
        data={gridRows}
        keyExtractor={keyExtractor}
        renderItem={renderGridRow}
        getItemLayout={getGridItemLayout}
        contentContainerStyle={{ paddingTop: headerInset }}
        style={{ borderRadius: 12, overflow: 'hidden' }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={9}
        removeClippedSubviews
        onEndReached={loadMore}
        onEndReachedThreshold={0.8}
        onScroll={handleScroll}
        onScrollBeginDrag={onScrollBegin}
        onScrollEndDrag={onScrollEnd}
        onMomentumScrollEnd={onScrollEnd}
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
            <View className="items-center py-6">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : endReachedRef.current && items.length > 0 ? (
            <View className="py-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">No more images</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !initialLoading ? (
            <View className="flex-1 items-center justify-center py-20">
              <Icon name="Image" size={48} color="#555" />
              <Text className="text-theme-neutrals-400 text-sm mt-4">No images found</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  multipleImagesIcon: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  patternRow: {
    flexDirection: "row",
    marginBottom: GRID_GAP,
    gap: GRID_GAP,
  },
  stackedColumn: {
    gap: GRID_GAP,
  },
  equalRow: {
    flexDirection: "row",
    marginBottom: GRID_GAP,
    gap: GRID_GAP,
  },
  skeletonItem: {
    backgroundColor: "#262626",
  },
});

export default memo(HomeImageGrid);
