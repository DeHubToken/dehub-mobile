import { useTranslation as _useCopy } from 'react-i18next';
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Icon, { type IconName } from "../ui/Icon";
import SkeletonBlock from "../Feed/SkeletonBlock";
import { getUnifiedFeed, type UnifiedFeedItem, type UnifiedFeedParams } from "../../services/feed.unified.service";
import { searchAccounts } from "../../services/search.service";
import { buildFeedImageUrls, getAvatarUrl, getImageUrl } from "../../libs/misc";
import { secondsToHMMSS } from "../../libs/date.util";
import { flattenFeedPages } from "../../libs/feed-pages";
import type { FeedSearchTab } from "../../libs/feed-search";
import { ScreenNames } from "../../navigation/ScreenNames";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { useAppTheme } from "../../context/ThemeContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";

/**
 * The grid the feed turns into while its pill is a search box, as on web:
 * photos as a mosaic, videos as small 16:10 tiles, shorts as 9:16 tiles that
 * open the swipe viewer, music as cover tiles, and Home as everything with
 * matching people first. `params` already carry the
 * feed's filters (libs/feed-search).
 */

const PAGE_SIZE = 24;
const GAP = 4;
const SIDE = 8;
/** Fixed bar heights, so the waveform on audio covers is the same every render. */
const WAVE = [38, 62, 45, 80, 55, 92, 48, 70, 35, 66, 84, 52, 40, 74, 58, 30];
const KIND_ICON: Partial<Record<string, IconName>> = { video: "Video", "feed-images": "Image", "feed-audio": "Mic", live: "Radio" };

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function imageOf(item: UnifiedFeedItem, size: number): string {
  const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  if (urls.length > 0) return buildFeedImageUrls([urls[0]], size)[0] || "";
  return getImageUrl(item.imageUrl || (item as any).thumbnailUrl || "", size);
}

/** Most audio posts have no cover: the creator's picture, else a tint of their own. */
function audioCover(item: UnifiedFeedItem, size: number): { uri: string; tint: string } {
  const own = imageOf(item, size);
  const avatar = (item as any).minterAvatarUrl ? getAvatarUrl((item as any).minterAvatarUrl, size) : "";
  const hue = (Number(item.tokenId) * 47) % 360;
  return { uri: own || (avatar !== "default-avatar" ? avatar : ""), tint: `hsl(${hue}, 50%, 30%)` };
}

const titleOf = (item: UnifiedFeedItem) => (item as any).name || item.description || "";
const handleOf = (item: UnifiedFeedItem) => (item as any).minterUsername || (item as any).mintername || (item as any).minterDisplayName || "";

const Wave = () => (
  <View pointerEvents="none" style={styles.wave}>
    {WAVE.map((h, k) => <View key={k} style={[styles.waveBar, { height: `${h}%` }]} />)}
  </View>
);

interface Props {
  tab: FeedSearchTab;
  query: string;
  params: UnifiedFeedParams;
  topInset: number;
  onSearchEverything: () => void;
}

const FeedSearchResults: React.FC<Props> = ({ tab, query, params, topInset, onSearchEverything }) => {
  const { t: _copy } = _useCopy();
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const q = useDebounced(query.trim(), 250);
  const typing = q !== query.trim();
  const layout: FeedSearchTab = tab;
  const cols = layout === "images" || layout === "home" || layout === "shorts" ? 3 : 2;
  const tile = (width - SIDE * 2 - GAP * (cols - 1)) / cols;

  const searchParams = useMemo(() => ({ ...params, search: q }), [params, q]);
  const feed = useInfiniteQuery({
    queryKey: ["feed-search", searchParams],
    queryFn: ({ pageParam }) => getUnifiedFeed({ ...searchParams, limit: PAGE_SIZE, page: pageParam }),
    initialPageParam: 1,
    enabled: q.length > 0,
    getNextPageParam: (last, _all, lastParam) =>
      (last.result?.length ?? 0) < PAGE_SIZE || !last.pagination?.hasMore ? undefined : lastParam + 1,
    staleTime: 60_000,
  });
  const people = useQuery({
    queryKey: ["feed-search-people", q],
    queryFn: () => searchAccounts(q, { limit: 10 }),
    enabled: tab === "home" && q.length >= 2,
    staleTime: 60_000,
  });

  // Shorts leaves pay-per-view out of its grid, so its search does too.
  const items = useMemo<UnifiedFeedItem[]>(() => {
    const all = flattenFeedPages<UnifiedFeedItem>(feed.data?.pages ?? [], () => false);
    return tab === "shorts" ? all.filter((item) => !(item as any).streamInfo?.isPayPerView) : all;
  }, [feed.data, tab]);
  const accounts = people.data?.items ?? [];
  const open = useCallback((item: UnifiedFeedItem) => navigation.navigate(ScreenNames.FeedDetail, { tokenId: item.tokenId }), [navigation]);
  // A short opens the swipe viewer on the matches, which keeps paging through them.
  const openShort = useCallback((index: number) => {
    navigation.navigate(ScreenNames.ShortsViewer, {
      initialIndex: index,
      initialItems: items,
      initialPage: Math.max(1, Math.floor(items.length / 20)),
      feedParams: searchParams,
    });
  }, [navigation, items, searchParams]);

  const fg = colors.foreground;
  const dim = colors.mutedForeground;
  const content = { paddingTop: topInset + 4, paddingHorizontal: SIDE, paddingBottom: TAB_BAR_CONTENT_INSET + 24 };

  if (feed.isLoading || (typing && items.length === 0)) {
    return (
      <View style={[StyleSheet.absoluteFill, content]} pointerEvents="none">
        <Text style={[styles.status, { color: dim }]}>{_copy("copy.90f1afe66801", { defaultValue: "Searching for “{{query}}”…", query: query.trim() })}</Text>
        <View style={styles.wrap}>
          {Array.from({ length: cols * 3 }, (_, i) => (
            <SkeletonBlock key={i} style={{ width: tile, height: layout === "videos" ? tile * 0.625 : layout === "shorts" ? tile * 16 / 9 : tile, borderRadius: 8 }} />
          ))}
        </View>
      </View>
    );
  }

  if (items.length === 0 && accounts.length === 0) {
    const failed = feed.isError;
    return (
      <View style={[StyleSheet.absoluteFill, content, styles.empty]}>
        <View style={[styles.orb, { borderColor: colors.border }]}><Icon name="Search" size={26} color={dim} /></View>
        <Text style={[styles.emptyTitle, { color: fg }]}>
          {failed
            ? _copy("copy.96d7bff86b44", { defaultValue: "Search could not load" })
            : _copy("copy.ef557404f465", { defaultValue: "No results for “{{query}}”", query: q })}
        </Text>
        <Text style={[styles.emptyText, { color: dim }]}>
          {failed
            ? _copy("copy.481859b689b0", { defaultValue: "Check your connection and try again." })
            : tab === "home"
              ? _copy("copy.d7b559f2d8c6", { defaultValue: "Try other words, or change the filters." })
              : _copy("copy.35034aa59bd3", { defaultValue: "Nothing in {{feed}} matched. Try other words or search everything.", feed: { images: "Images", shorts: "Shorts", videos: "Videos", music: "Music", home: "Home" }[tab] })}
        </Text>
        {failed ? (
          <Pressable onPress={() => feed.refetch()} style={[styles.button, { borderColor: colors.border }]}>
            <Text style={[styles.buttonText, { color: fg }]}>{_copy("copy.d8b8392e2c54", { defaultValue: "Try again" })}</Text>
          </Pressable>
        ) : tab !== "home" ? (
          <Pressable onPress={onSearchEverything} style={[styles.button, { borderColor: colors.border }]}>
            <Icon name="Search" size={14} color={fg} />
            <Text style={[styles.buttonText, { color: fg }]}>{_copy("copy.415155739590", { defaultValue: "Search everything" })}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const header = tab === "home" ? (
    <View>
      {accounts.length > 0 ? (
        <>
          <Text style={[styles.section, { color: dim }]}>{_copy("copy.7db20897053b", { defaultValue: "People" })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
            {accounts.map((a) => {
              const avatar = getAvatarUrl(a.avatarImageUrl, 48);
              return (
                <Pressable key={a.address} onPress={() => a.username && showUserProfile(a.username, { source: "search" } as any)} style={styles.person}>
                  <View style={[styles.avatar, { borderColor: colors.border }]}>
                    {avatar !== "default-avatar" ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.personName, { color: fg }]}>@{a.username || a.address.slice(0, 6)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
      {items.length > 0 ? <Text style={[styles.section, { color: dim }]}>{_copy("copy.a80811cf6889", { defaultValue: "Posts" })}</Text> : null}
    </View>
  ) : null;

  const renderItem = ({ item, index }: { item: UnifiedFeedItem; index: number }) => {
    if (layout === "shorts") {
      const thumb = imageOf(item, Math.round(tile * 2));
      return (
        <Pressable onPress={() => openShort(index)} style={[styles.short, { width: tile, height: tile * 16 / 9 }]}>
          {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.shortShade} pointerEvents="none" />
          <Text numberOfLines={1} style={styles.shortBy}>@{handleOf(item)}</Text>
        </Pressable>
      );
    }
    if (layout === "videos") {
      const thumb = imageOf(item, Math.round(tile));
      const duration = item.videoDuration ? secondsToHMMSS(item.videoDuration) : undefined;
      return (
        <Pressable onPress={() => open(item)} style={{ width: tile }}>
          <View style={[styles.videoThumb, { height: tile * 0.625 }]}>
            {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {duration ? <Text style={styles.duration}>{duration}</Text> : null}
          </View>
          <Text numberOfLines={1} style={[styles.title, { color: fg }]}>{titleOf(item)}</Text>
          <Text numberOfLines={1} style={[styles.by, { color: dim }]}>@{handleOf(item)}</Text>
        </Pressable>
      );
    }
    if (layout === "music") {
      const cover = audioCover(item, Math.round(tile));
      return (
        <Pressable onPress={() => open(item)} style={[styles.audioCard, { width: tile, borderColor: colors.border }]}>
          <View style={{ width: tile, height: tile, backgroundColor: cover.tint }}>
            {cover.uri ? <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.coverShade} />
            <Wave />
            <View style={styles.play}><Icon name="Play" size={11} color="#000000" /></View>
          </View>
          <Text numberOfLines={1} style={[styles.title, styles.audioText, { color: fg }]}>{titleOf(item)}</Text>
          <Text numberOfLines={1} style={[styles.by, styles.audioText, { color: dim, paddingBottom: 6 }]}>@{handleOf(item)}</Text>
        </Pressable>
      );
    }
    const uri = imageOf(item, Math.round(tile));
    const audio = (item.postType === "feed-audio" || (item.postType as string) === "audio") && !uri;
    const kind = tab === "home" ? KIND_ICON[item.postType] : undefined;
    return (
      <Pressable onPress={() => open(item)} style={[styles.square, { width: tile, height: tile, borderColor: colors.border }]}>
        {audio ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: audioCover(item, Math.round(tile)).tint }]}><Wave /></View>
        ) : uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.textTile}>
            <Text numberOfLines={1} style={[styles.by, { color: dim }]}>@{handleOf(item)}</Text>
            <Text numberOfLines={5} style={[styles.textBody, { color: fg }]}>{titleOf(item)}</Text>
          </View>
        )}
        {kind && (uri || audio) ? <View style={styles.kind}><Icon name={kind} size={10} color="#FFFFFF" /></View> : null}
      </Pressable>
    );
  };

  return (
    <FlatList
      key={`${layout}-${cols}`}
      style={[StyleSheet.absoluteFill, { opacity: typing || (feed.isFetching && !feed.isFetchingNextPage) ? 0.6 : 1 }]}
      data={items}
      keyExtractor={(item) => String(item.tokenId)}
      numColumns={cols}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={[content, { gap: layout === "videos" ? 10 : GAP }]}
      ListHeaderComponent={header}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={0.6}
      onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage().catch(() => {}); }}
    />
  );
};

const styles = StyleSheet.create({
  status: { fontSize: 12, paddingHorizontal: 2, paddingBottom: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 2, paddingTop: 4, paddingBottom: 8 },
  people: { gap: 12, paddingHorizontal: 2, paddingBottom: 10 },
  person: { width: 56, alignItems: "center", gap: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: "hidden", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  personName: { fontSize: 10, width: 56, textAlign: "center" },
  square: { borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" },
  textTile: { flex: 1, padding: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.14)", borderRadius: 8 },
  textBody: { fontSize: 11, lineHeight: 14, marginTop: 2 },
  kind: { position: "absolute", left: 5, top: 5, width: 18, height: 18, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  short: { borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", justifyContent: "flex-end" },
  shortShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  shortBy: { color: "#FFFFFF", fontSize: 10, fontWeight: "600", paddingHorizontal: 6, paddingBottom: 6, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3 },
  videoThumb: { borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" },
  duration: { position: "absolute", right: 4, bottom: 4, backgroundColor: "rgba(0,0,0,0.7)", color: "#FFFFFF", fontSize: 10, fontWeight: "600", paddingHorizontal: 4, borderRadius: 4, overflow: "hidden" },
  title: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  by: { fontSize: 11 },
  audioCard: { borderRadius: 12, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.03)" },
  audioText: { paddingHorizontal: 8 },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  wave: { position: "absolute", left: 8, right: 36, bottom: 9, height: 16, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  waveBar: { flex: 1, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.9)" },
  play: { position: "absolute", right: 7, bottom: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  orb: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyText: { fontSize: 13, textAlign: "center", maxWidth: 280 },
  button: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  buttonText: { fontSize: 13, fontWeight: "700" },
});

export default memo(FeedSearchResults);
