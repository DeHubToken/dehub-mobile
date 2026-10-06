/**
 * ShortsCarousel – the "Scroll" rail in the home feed.
 *
 * Mirrors web's home Scroll carousel: this month's most-viewed videos
 * (long-form first) interleaved with this month's most-viewed photo posts
 * that carry a soundtrack. Renders nothing until data arrives.
 */
import React, { useCallback } from "react";
import { View, FlatList, type ListRenderItem } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { isShortsPhoto, interleaveShorts } from "../../libs/shortsPhotos";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAppPrefs } from "../../hooks/useAppPrefs";
import ShortsGridCard from "./ShortsGridCard";

/** Step out over the feed list's side padding, with no frame around the rail. */
const LIST_GUTTER = 8;
const EMPTY_ITEMS: UnifiedFeedItem[] = [];
const REEL_SIZE = 10;
/** /feed has no duration filter, so over-fetch to find enough long-form. Matches web. */
const VIDEO_FETCH_LIMIT = 50;
/** Web treats a video over 90s as long-form; shorter ones are the top-up. */
const LONG_FORM_MIN_SECONDS = 90;
const CARD_WIDTH = 120;

async function fetchCarousel(): Promise<UnifiedFeedItem[]> {
  const [videos, photos] = await Promise.all([
    getUnifiedFeed({ postType: "video", sortBy: "views", sortOrder: "desc", range: "month", limit: VIDEO_FETCH_LIMIT, status: "all" }),
    getUnifiedFeed({ postType: "feed-images", search: "soundtrack", sortBy: "views", sortOrder: "desc", range: "month", limit: REEL_SIZE, status: "all" }),
  ]);
  const open = (videos.result || []).filter((item) => !item.streamInfo?.isPayPerView);
  const isLongForm = (item: UnifiedFeedItem) => (item.videoDuration ?? 0) > LONG_FORM_MIN_SECONDS;
  const ranked = [...open.filter(isLongForm), ...open.filter((item) => !isLongForm(item))];
  return interleaveShorts(ranked, (photos.result || []).filter(isShortsPhoto)).slice(0, REEL_SIZE);
}

export function useHomeShortsCarousel(enabled: boolean): UnifiedFeedItem[] {
  const shortsEnabled = useAppPrefs().shorts;
  const { data: items = EMPTY_ITEMS } = useQuery({
    queryKey: ["home-shorts-carousel"],
    queryFn: fetchCarousel,
    enabled: enabled && shortsEnabled,
    staleTime: 5 * 60 * 1000,
  });
  return enabled && shortsEnabled ? items : EMPTY_ITEMS;
}

const ShortsCarousel: React.FC<{ items: UnifiedFeedItem[] }> = ({ items }) => {
  const navigation = useNavigation<any>();

  const handlePress = useCallback((index: number) => {
    navigation.navigate(ScreenNames.ShortsViewer, {
      initialIndex: index,
      initialItems: items,
      feedParams: { sortBy: "views" },
    });
  }, [navigation, items]);

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
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal
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
