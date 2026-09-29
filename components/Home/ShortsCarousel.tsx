/**
 * ShortsCarousel – "Most viewed this month" rail in the home feed.
 *
 * Mirrors web's home Scroll carousel: this month's most-viewed videos
 * (long-form first) interleaved with this month's most-viewed photo posts
 * that carry a soundtrack. Renders nothing until data arrives.
 */
import React, { useCallback, useMemo } from "react";
import { View, Text, FlatList, type ListRenderItem } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE, MINIMAL_INSET } from "../../theme/minimal";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { isShortsPhoto, interleaveShorts } from "../../libs/shortsPhotos";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAppPrefs } from "../../hooks/useAppPrefs";
import ShortsGridCard from "./ShortsGridCard";

/** Same as SuggestedAccountsSection: step out over the feed list's side padding in minimal. */
const MINIMAL_LIST_GUTTER = 8;
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

const ShortsCarousel: React.FC = () => {
  const { t } = useTranslation();
  const { isMinimal } = useAppTheme();
  const navigation = useNavigation<any>();
  const shortsEnabled = useAppPrefs().shorts;
  const { data: items = [] } = useQuery({
    queryKey: ["home-shorts-carousel"],
    queryFn: fetchCarousel,
    enabled: shortsEnabled,
    staleTime: 5 * 60 * 1000,
  });

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
  const contentStyle = useMemo(() => ({ paddingHorizontal: isMinimal ? MINIMAL_INSET : 8 }), [isMinimal]);

  if (!shortsEnabled || items.length === 0) return null;

  const list = (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      contentContainerStyle={contentStyle}
    />
  );

  return (
    <View
      className={isMinimal ? undefined : "mb-3"}
      style={isMinimal ? {
        marginHorizontal: -MINIMAL_LIST_GUTTER,
        paddingTop: 14,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: MINIMAL_HAIRLINE,
      } : undefined}
    >
      <View
        className="flex-row items-center px-2 mb-2.5"
        style={isMinimal ? { paddingHorizontal: MINIMAL_INSET } : undefined}
      >
        <Text className="text-white text-sm font-semibold">{t("feed.mostViewedThisMonth")}</Text>
      </View>
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list}
    </View>
  );
};

export default React.memo(ShortsCarousel);
