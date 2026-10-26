/**
 * ShortsCarousel – the "Scroll" rail in the home feed.
 *
 * Mirrors web's home Scroll carousel: this month's most-viewed videos
 * (long-form first) interleaved with this month's most-viewed photo posts
 * that carry a soundtrack. Renders nothing until data arrives.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, FlatList, type ListRenderItem } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../../context/AuthContext';
import { useShortsRotation, type ShortsHistoryStore } from '../../hooks/useShortsRotation';
import { shortsBatchCount } from '../../libs/shortsRotation';
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { isShortsPhoto } from "../../libs/shortsPhotos";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAppPrefs } from "../../hooks/useAppPrefs";
import ShortsGridCard from "./ShortsGridCard";

/** Step out over the feed list's side padding, with no frame around the rail;
 *  the rail's own padding puts the first and last cards back in line with the posts. */
const LIST_GUTTER = 8;
const CARD_WIDTH = 120;
const RAIL_CONTENT_STYLE = { paddingLeft: LIST_GUTTER, paddingRight: LIST_GUTTER - 6 };
const EMPTY_ITEMS: UnifiedFeedItem[] = [];
let historyWrite = Promise.resolve();
const historyStore: ShortsHistoryStore = {
  read: key => historyWrite.then(() => AsyncStorage.getItem(key)),
  write: (key, value) => {
    historyWrite = historyWrite.catch(() => {}).then(() => AsyncStorage.setItem(key, value));
    return historyWrite;
  },
};

const REDRAW_AFTER_AWAY_MS = 10 * 60 * 1000;

export function useHomeShortsCarousel(enabled: boolean, postCount: number, active: boolean) {
  const shortsEnabled = useAppPrefs().shorts;
  const user = useUser();
  const viewer = user?.walletAddress || user?.id || 'guest';
  const isFocused = useIsFocused();
  const navigation = useNavigation<any>();
  const onScreen = active && isFocused;
  const [visit, setVisit] = useState(0);
  const previousActive = useRef(onScreen);
  const lastAwayRoute = useRef<string | undefined>(undefined);
  const offsets = useRef(new Map<string, number>());
  const refresh = useCallback(() => {
    offsets.current.clear();
    setVisit(value => value + 1);
  }, []);
  useEffect(() => {
    // Root routes include the Shorts viewer; a viewer return preserves the draw.
    const root = navigation.getParent?.();
    const sync = () => {
      const state = root?.getState?.();
      const route = state?.routes[state.index ?? 0]?.name;
      if (route && route !== ScreenNames.Root) lastAwayRoute.current = route;
    };
    const unsubscribe = root?.addListener?.('state', sync);
    return () => unsubscribe?.();
  }, [navigation]);
  const preserveViewerReturn = useRef(false);
  const onViewerOpen = useCallback(() => { preserveViewerReturn.current = true; }, []);
  // A quick trip away (a profile, a tab, a post) comes back to the same row:
  // redrawing it on every return blanked the tiles and jumped the feed. Only a
  // real absence earns a fresh draw.
  const leftAt = useRef(0);
  useEffect(() => {
    if (onScreen && !previousActive.current) {
      const fromViewer = lastAwayRoute.current
        ? lastAwayRoute.current === ScreenNames.ShortsViewer
        : preserveViewerReturn.current;
      preserveViewerReturn.current = false;
      lastAwayRoute.current = undefined;
      const longAway = leftAt.current > 0 && Date.now() - leftAt.current > REDRAW_AFTER_AWAY_MS;
      if (!fromViewer && longAway) refresh();
    }
    if (!onScreen && previousActive.current) leftAt.current = Date.now();
    previousActive.current = onScreen;
  }, [onScreen, refresh]);

  const queryEnabled = enabled && shortsEnabled && onScreen;
  const videos = useInfiniteQuery({
    queryKey: ['home-shorts-videos', viewer],
    queryFn: ({ pageParam }) => getUnifiedFeed({ postType: 'video', sortBy: 'views', sortOrder: 'desc', range: 'month', limit: 50, page: pageParam, status: 'all' }),
    initialPageParam: 1,
    getNextPageParam: page => page.pagination.hasMore ? page.pagination.page + 1 : undefined,
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const photos = useInfiniteQuery({
    queryKey: ['home-shorts-photos', viewer],
    queryFn: ({ pageParam }) => getUnifiedFeed({ postType: 'feed-images', search: 'soundtrack', sortBy: 'views', sortOrder: 'desc', range: 'month', limit: 20, page: pageParam, status: 'all' }),
    initialPageParam: 1,
    getNextPageParam: page => page.pagination.hasMore ? page.pagination.page + 1 : undefined,
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const candidates = useMemo(() => [
    ...(videos.data?.pages.flatMap(page => page.result) ?? EMPTY_ITEMS).filter(item => !item.streamInfo?.isPayPerView),
    ...(photos.data?.pages.flatMap(page => page.result) ?? EMPTY_ITEMS).filter(isShortsPhoto),
  ], [videos.data, photos.data]);
  const count = enabled && shortsEnabled ? shortsBatchCount(postCount) : 0;
  const rotation = useShortsRotation(candidates, count, `${viewer}:${visit}`, `home-shorts-recent:${viewer}`,
    historyStore, queryEnabled && (!!videos.data || videos.isError) && (!!photos.data || photos.isError),
    (!videos.hasNextPage || videos.isError) && (!photos.hasNextPage || photos.isError));
  useEffect(() => {
    if (!queryEnabled || !count || rotation.batches.length >= count) return;
    if (videos.hasNextPage && !videos.isFetching && !videos.isError) void videos.fetchNextPage();
    if (photos.hasNextPage && !photos.isFetching && !photos.isError) void photos.fetchNextPage();
  }, [queryEnabled, count, rotation.batches.length, videos.hasNextPage, videos.isFetching, videos.isError,
    videos.fetchNextPage, photos.hasNextPage, photos.isFetching, photos.isError, photos.fetchNextPage]);
  return { ...rotation, batches: enabled && shortsEnabled ? rotation.batches : [], refresh, onViewerOpen, offsets };
}

const ShortsCarousel: React.FC<{
  items: UnifiedFeedItem[];
  onViewerOpen: () => void;
  initialOffset: number;
  onOffset: (offset: number) => void;
}> = ({ items, onViewerOpen, initialOffset, onOffset }) => {
  const navigation = useNavigation<any>();

  const handlePress = useCallback((index: number) => {
    onViewerOpen();
    navigation.navigate(ScreenNames.ShortsViewer, {
      initialIndex: index,
      initialItems: items,
      feedParams: { sortBy: "views" },
    });
  }, [navigation, items, onViewerOpen]);

  const renderItem: ListRenderItem<UnifiedFeedItem> = useCallback(
    ({ item, index }) => (
      <View style={{ marginRight: 6 }}>
        <ShortsGridCard item={item} index={index} onPress={handlePress} width={CARD_WIDTH} />
      </View>
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: UnifiedFeedItem) => String(item.tokenId ?? item.id), []);

  // Keeps a sideways drag on the rail from turning Home's feed tabs.
  const scrollGuard = useHorizontalScrollGuard();
  if (items.length === 0) return null;

  const list = (
    <FlatList
      data={items}
      contentOffset={{ x: initialOffset, y: 0 }}
      onScroll={event => onOffset(event.nativeEvent.contentOffset.x)}
      scrollEventThrottle={32}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal
      contentContainerStyle={RAIL_CONTENT_STYLE}
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
    />
  );

  return (
    <View style={{ marginHorizontal: -LIST_GUTTER, marginVertical: 12 }}>
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list}
    </View>
  );
};

export default React.memo(ShortsCarousel);
