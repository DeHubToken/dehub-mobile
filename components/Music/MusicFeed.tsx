import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * MusicFeed — the Audio tab
 * =========================
 * Until now this tab was a plain vertical list of `feed-audio` posts, which is
 * why it read as "just voice recordings". Web's Music feed is a browse surface:
 * sub-tabs across the top and, under All, a shelf each for music videos, radio
 * stations, audio uploads and live stages. This is that, for the phone.
 *
 * Everything is one `Animated.FlatList` so the collapsing header keeps working
 * — HomeScreen drives it from a worklet scroll handler, and a second scroll
 * container inside the page would leave the header stuck. The sub-tab row rides
 * in the list header rather than pinned, for the same reason.
 *
 * Two deliberate differences from web, both bugs there rather than choices:
 *
 * - **Audio uploads are fetched as `feed-audio` only.** Web also asks for
 *   `postType: 'audio'`, which the API does not recognise — and an unrecognised
 *   post type gets an *unfiltered* feed back, so that shelf is quietly padded
 *   with the whole feed.
 * - **The radio shelf is two requests, not ten.** See libs/radio-browser.
 *
 * @module components/Music/MusicFeed
 */

import { isVisibleInMusic } from "./music-curation";
import { fetchMusicVideoChart, MUSIC_VIDEO_CHART_SORTS, type MusicVideoChartSort } from "./music-video-chart";
import { secondsToHMMSS } from "../../libs/date.util";
import { formatCompactNumber, resolveViewCount } from "../../libs/numbers.util";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon, { type IconName } from "../ui/Icon";
import CompactVideoCard from "../Home/CompactVideoCard";
import AudioPostPlayer from "../Home/ProtectedAudioPostPlayer";
import MusicVideoCard from "./MusicVideoCard";
import RadioStationCard from "./RadioStationCard";
import { FEED_SIDE } from "../Home/feedLayout";
import StagesChart from "./StagesChart";
import ChartShelf from "./ChartShelf";
import RadioStage from "./RadioStage";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useAuth } from "../../context/AuthContext";
import { useAppTheme } from '../../context/ThemeContext';
import { getNFTs, type GetNFTsResult } from "../../services/nft.service";
import {
  RADIO_GENRES,
  getCuratedCarouselStations,
  getPrimaryTags,
  getTopStations,
  getStationsByGenre,
  searchStations,
  type RadioGenreId,
  type RadioStation,
} from "../../libs/radio-browser";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { getAudioUrl, getImageUrl } from "../../libs/misc";
import { isHoldGated } from "../../libs/content-gate";
import { useTranslation } from "react-i18next";

const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

type MusicSubTab = "all" | "tracks" | "videos" | "radio" | "stages";

// Same five, in web's order, so the tab you reach for is where you left it.
// Labels are i18n keys, resolved at render time.
const SUB_TABS: { value: MusicSubTab; label: string; icon: IconName }[] = [
  { value: "all", label: "music.all", icon: "Music" },
  { value: "tracks", label: "music.tracks", icon: "Disc3" },
  { value: "videos", label: "music.videos", icon: "Play" },
  { value: "radio", label: "music.radio", icon: "Radio" },
  { value: "stages", label: "nav.stages", icon: "Mic" },
];

/** Shelves rendered under All, in web's order. */
type Shelf = "videos" | "radio" | "audio" | "stages";
const ALL_SHELVES: Shelf[] = ["audio", "videos", "radio", "stages"];

const CAROUSEL_PAGE_SIZE = 12;
// Rows the music video chart shows before "See all".
const VIDEOS_PAGE_SIZE = 10;

export interface MusicFeedHandle {
  /** Tapping the logo goes to the top, the same as every other feed. */
  scrollToTop: () => void;
}

export interface MusicFeedProps {
  active?: boolean;
  headerInset?: number;
  scrollHandler?: any;
  onScrollBegin?: () => void;
  onScrollEnd?: () => void;
  onRefresh?: () => void;
  feedRef?: React.MutableRefObject<MusicFeedHandle | null>;
}

// ── Shelves ─────────────────────────────────────────────────────────────────

/**
 * Wraps a horizontally-scrolling child so it blocks Home's page-turn gesture
 * while it is scrolling. Same job HorizontalShelf does for itself, for the
 * chrome rows that are not shelves.
 */
const GuardedRow: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const scrollGuard = useHorizontalScrollGuard();
  return scrollGuard ? <GestureDetector gesture={scrollGuard}>{children}</GestureDetector> : children;
};

// ── The tab ─────────────────────────────────────────────────────────────────

const MusicFeed: React.FC<MusicFeedProps> = ({
  active = true,
  headerInset = 0,
  scrollHandler,
  onScrollBegin,
  onScrollEnd,
  onRefresh,
  feedRef,
}) => {
  const { t } = useTranslation();
  const listRef = useRef<FlatList<any> | null>(null);
  useEffect(() => {
    if (!feedRef) return;
    feedRef.current = {
      scrollToTop: () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    };
    return () => {
      feedRef.current = null;
    };
  }, [feedRef]);

  const [tab, setTab] = useState<MusicSubTab>("all");
  const [chartSort, setChartSort] = useState<'trending' | 'popular' | 'new'>('trending');
  const [videoChartSort, setVideoChartSort] = useState<MusicVideoChartSort>('views');
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 10, minimumViewTime: 150 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ key: string }> }) => {
    setVisibleIds(new Set(viewableItems.map(item => item.key)));
  }).current;
  const [genre, setGenre] = useState<RadioGenreId>("top");
  const [search, setSearch] = useSurfaceDraft("components/Music/MusicFeed.tsx:search", "");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { user } = useAuth();
  const address = user?.walletAddress || user?.address || undefined;

  const isSearchingRadio = debouncedSearch.trim().length > 0;

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: audioUploads = [], isLoading: loadingAudio } = useQuery({
    queryKey: ["music-audio-uploads", address, chartSort],
    queryFn: async () => {
      const res = await getNFTs({
        postType: "feed-audio",
        unit: CAROUSEL_PAGE_SIZE,
        sortMode: chartSort,
        address,
      });
      return (res.result || []).filter(isVisibleInMusic);
    },
    staleTime: 5 * 60_000,
  });

  // Music video charts, ranked on the server (same orders as web).
  const { data: videoChart = [], isLoading: loadingVideoChart } = useQuery({
    queryKey: ["music-video-chart", address, videoChartSort],
    queryFn: async () => (await fetchMusicVideoChart(videoChartSort, address)).filter(isVisibleInMusic),
    staleTime: 5 * 60_000,
  });

  const { data: curatedStations = [] } = useQuery({
    queryKey: ["radio-stations-curated"],
    queryFn: () => getCuratedCarouselStations(),
    staleTime: 10 * 60_000,
  });

  const { data: genreStations = [], isLoading: loadingGenre } = useQuery({
    queryKey: ["radio-stations", genre],
    queryFn: () => getStationsByGenre(genre, 50),
    enabled: tab === "radio" && !isSearchingRadio,
    staleTime: 5 * 60_000,
  });

  const { data: searchedStations = [], isLoading: loadingSearch } = useQuery({
    queryKey: ["radio-search", debouncedSearch],
    queryFn: () => searchStations(debouncedSearch.trim(), 50),
    enabled: tab === "radio" && isSearchingRadio,
    staleTime: 2 * 60_000,
  });

  const musicVideos = useInfiniteQuery({
    queryKey: ["music-videos-infinite", address],
    enabled: tab === "videos",
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const res = await getNFTs({
        category: "Music",
        postType: "video",
        unit: VIDEOS_PAGE_SIZE,
        page: pageParam as number,
        sortMode: "new",
        address,
      });
      return { items: res.result || [], page: pageParam as number };
    },
    getNextPageParam: (last) =>
      last.items.length >= VIDEOS_PAGE_SIZE ? last.page + 1 : undefined,
    staleTime: 5 * 60_000,
  });

  const videoItems = useMemo(
    () => musicVideos.data?.pages.flatMap((p) => p.items).filter(isVisibleInMusic) ?? [],
    [musicVideos.data],
  );

  const stations: RadioStation[] = isSearchingRadio ? searchedStations : genreStations;
  const loadingStations = isSearchingRadio ? loadingSearch : loadingGenre;

  // Pull-to-refresh has to invalidate this page's own queries. HomeScreen's
  // handler only re-seeds the shuffle for the feed lists, which this page is
  // not one of — wired to that alone, the spinner would run and nothing behind
  // it would change.
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    onRefresh?.();
    try {
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey?.[0] ?? "");
          return key.startsWith("music-") || key.startsWith("radio-");
        },
      });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, onRefresh]);

  // ── List content per tab ──────────────────────────────────────────────────

  const renderShelf = useCallback(
    (shelf: Shelf) => {
      switch (shelf) {
        case "videos":
          return (
            <ChartShelf
              icon="Play"
              title={t("music.musicVideos")}
              count={videoChart.length}
              sorts={MUSIC_VIDEO_CHART_SORTS.map(option => ({ value: option.value, label: t(option.key, { defaultValue: option.fallback }) }))}
              sort={videoChartSort}
              onSort={setVideoChartSort}
              rows={videoChart.map((item, index) => {
                const creator = (item as any).minterDisplayName || (item as any).minterUsername || (item as any).mintername || "";
                const views = resolveViewCount(item);
                const rawThumb = (item as any).thumbnail || item.thumbnailUrl || item.imageUrl || "";
                return {
                  id: String(item.tokenId ?? item.id ?? index),
                  title: item.name || (item as any).title || "",
                  subtitle: [creator, views ? t("music.viewsCount", { count: views, views: formatCompactNumber(views) }) : ""].filter(Boolean).join(" · "),
                  thumb: rawThumb ? getImageUrl(rawThumb, 160) : undefined,
                  badge: secondsToHMMSS(item.videoDuration) || undefined,
                };
              })}
              loading={loadingVideoChart}
              emptyText={t("music.noMusicVideos")}
              thumbs="wide"
              renderSelected={id => {
                const item = videoChart.find((nft, index) => String(nft.tokenId ?? nft.id ?? index) === id);
                return item ? <MusicVideoCard nft={item} wide /> : null;
              }}
            />
          );
        case "radio":
          return <RadioChart curated={curatedStations} />;
        case "audio":
          return (
            <ChartShelf
              icon="Disc3"
              title={t("music.audioUploads")}
              count={audioUploads.length}
              sorts={[
                { value: "trending", label: t("music.mostPlayed", { defaultValue: "Most played" }) },
                { value: "popular", label: t("music.mostLiked", { defaultValue: "Most liked" }) },
                { value: "new", label: t("music.mostRecent", { defaultValue: "Most recent" }) },
              ]}
              sort={chartSort}
              onSort={setChartSort}
              rows={audioUploads.map((item, index) => ({
                id: String(item.tokenId ?? item.id ?? index),
                title: item.name || (item as any).title || "",
                subtitle: (item as any).minterDisplayName || (item as any).minterUsername || (item as any).mintername || "",
              }))}
              loading={loadingAudio}
              emptyText={t("music.noAudioUploads")}
              renderSelected={id => {
                const item = audioUploads.find((nft, index) => String(nft.tokenId ?? nft.id ?? index) === id);
                return item ? <AudioUploadCard nft={item} isVisible={active && visibleIds.has("shelf-audio")} desk /> : null;
              }}
            />
          );
        case "stages":
          return <StagesChart />;
      }
    },
    [curatedStations, audioUploads, loadingAudio, active, visibleIds, chartSort, videoChart, loadingVideoChart, videoChartSort, t],
  );

  const { data, renderItem, keyExtractor } = useMemo(() => {
    switch (tab) {
      case "all":
        return {
          data: ALL_SHELVES as any[],
          keyExtractor: (item: any) => `shelf-${item}`,
          renderItem: ({ item }: ListRenderItemInfo<any>) => renderShelf(item as Shelf),
        };
      case "videos":
        return {
          data: videoItems as any[],
          keyExtractor: (item: any, i: number) => String(item.tokenId ?? item.id ?? i),
          renderItem: ({ item }: ListRenderItemInfo<any>) => (
            <CompactVideoCard nft={item} showCreator />
          ),
        };
      case "radio":
        return {
          data: stations as any[],
          keyExtractor: (item: any) => item.stationuuid,
          renderItem: ({ item }: ListRenderItemInfo<any>) => (
            <View style={styles.rowWrap}>
              <RadioStationCard station={item} variant="row" />
            </View>
          ),
        };
      case "stages":
        return {
          data: ["stages"] as any[],
          keyExtractor: () => "stages",
          renderItem: () => <StagesChart />,
        };
      // Tracks is the audio chart on its own. The key matches All's audio
      // shelf, so the selected track plays when it is on screen.
      case "tracks":
        return {
          data: ["audio"] as any[],
          keyExtractor: () => "shelf-audio",
          renderItem: () => renderShelf("audio"),
        };
      default:
        return { data: [] as any[], keyExtractor: (_: any, i: number) => String(i), renderItem: () => null };
    }
  }, [tab, videoItems, stations, renderShelf]);

  const listHeader = useMemo(
    () => (
      <View>
        {/* Mirrors the spacer every other feed uses so content starts below the
            collapsing header rather than under it. */}
        <View style={{ height: headerInset }} />

        {/* Guarded like the shelves: these rows overflow the screen, and a drag
            along them would otherwise turn the feed page instead. */}
        <GuardedRow>
        <FlatList
          data={SUB_TABS}
          keyExtractor={(t) => t.value}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabRow}
          renderItem={({ item }) => {
            const active = tab === item.value;
            return (
              <TouchableOpacity
                onPress={() => setTab(item.value)}
                style={[styles.subTab, active && styles.subTabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(item.label)}
              >
                <Icon
                  name={item.icon}
                  size={13}
                  color={active ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
                />
                <Text style={[styles.subTabText, active && styles.subTabTextOn]}>
                  {t(item.label)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
        </GuardedRow>

        {tab === "radio" && (
          <View style={styles.radioChrome}>
            <View style={styles.searchWrap}>
              <Icon name="Search" size={15} color="rgba(255,255,255,0.4)" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("music.searchRadio")}
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch.complete(search, "")} hitSlop={8}>
                  <Icon name="X" size={15} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            {!isSearchingRadio && (
              <GuardedRow>
              <FlatList
                data={RADIO_GENRES as unknown as { id: RadioGenreId; label: string }[]}
                keyExtractor={(g) => g.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.genreRow}
                renderItem={({ item }) => {
                  const active = genre === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => setGenre(item.id)}
                      style={[styles.genrePill, active && styles.genrePillOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.genreText, active && styles.genreTextOn]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
              </GuardedRow>
            )}
          </View>
        )}
      </View>
    ),
    [headerInset, tab, search, genre, isSearchingRadio, t, setSearch],
  );

  const listEmpty = useMemo(() => {
    if (tab === "radio") {
      if (loadingStations) return <ActivityIndicator style={styles.loader} color="#FFFFFF" />;
      return (
        <View style={styles.empty}>
          <Icon name="Radio" size={26} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>
            {isSearchingRadio ? t("music.noStationsFound") : t("music.noStationsAvailable")}
          </Text>
          <Text style={styles.emptyNote}>
            {isSearchingRadio ? t("music.tryDifferentSearch") : t("music.tryAnotherGenre")}
          </Text>
        </View>
      );
    }
    if (tab === "videos") {
      if (musicVideos.isLoading) return <ActivityIndicator style={styles.loader} color="#FFFFFF" />;
      return (
        <View style={styles.empty}>
          <Icon name="Play" size={26} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>{t("music.noMusicVideos")}</Text>
        </View>
      );
    }
    return null;
  }, [tab, loadingStations, isSearchingRadio, musicVideos.isLoading, t]);

  return (
    <View style={{ flex: 1 }}>
      <AnimatedFlatList
      ref={listRef as any}
      data={data}
      keyExtractor={keyExtractor as any}
      renderItem={renderItem as any}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={
        tab === "videos" && musicVideos.isFetchingNextPage ? (
          <ActivityIndicator style={styles.loader} color="#FFFFFF" />
        ) : null
      }
      onEndReached={
        tab === "videos" && musicVideos.hasNextPage && !musicVideos.isFetchingNextPage
          ? () => musicVideos.fetchNextPage()
          : undefined
      }
      onEndReachedThreshold={0.6}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      onScrollBeginDrag={onScrollBegin}
      onMomentumScrollEnd={onScrollEnd}
      // See InfiniteVideoFeed: 16 is below Android's 17ms throttle floor.
      scrollEventThrottle={24}
      refreshControl={
        <DeHubRefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#FFFFFF"
          progressViewOffset={headerInset}
        />
      }
      />
      <DeHubRefreshMark pill={active} refreshing={refreshing} topInset={headerInset} />
    </View>
  );
};

const AUDIO_CARD_WIDTH = 280;

type RadioChartSort = "picks" | "played" | "voted" | "trending";

/**
 * Radio as a chart: our hand-picked stations, or radio-browser's top list
 * ranked by plays, votes or how fast it is climbing. The picked station
 * plays from its card.
 */
const RadioChart: React.FC<{ curated: RadioStation[] }> = ({ curated }) => {
  const { t } = useTranslation();
  const [sort, setSort] = useState<RadioChartSort>("picks");
  const { data: top = [], isLoading } = useQuery({
    queryKey: ["radio-stations-top"],
    queryFn: () => getTopStations(30),
    enabled: sort !== "picks",
    staleTime: 10 * 60_000,
  });
  const stations = useMemo(() => {
    if (sort === "picks") return curated;
    const field = sort === "played" ? "clickcount" : sort === "voted" ? "votes" : "clicktrend";
    return [...top].sort((a, b) => (b[field] || 0) - (a[field] || 0)).slice(0, 20);
  }, [sort, curated, top]);
  return (
    <ChartShelf
      icon="Radio"
      title={t("music.radioStations")}
      sorts={[
        { value: "picks", label: t("music.radioPicks", { defaultValue: "Our picks" }) },
        { value: "played", label: t("music.mostPlayed", { defaultValue: "Most played" }) },
        { value: "voted", label: t("music.mostVoted", { defaultValue: "Most voted" }) },
        { value: "trending", label: t("music.trending", { defaultValue: "Trending" }) },
      ]}
      sort={sort}
      onSort={setSort}
      rows={stations.map(station => ({
        id: station.stationuuid,
        title: station.name.trim(),
        subtitle: [station.countrycode, ...getPrimaryTags(station.tags)].filter(Boolean).join(" · "),
        thumb: station.favicon || undefined,
      }))}
      loading={sort === "picks" ? curated.length === 0 : isLoading}
      emptyText={t("music.noStationsAvailable", { defaultValue: "No stations available" })}
      thumbs="square"
      renderSelected={(id, { next }) => {
        const index = stations.findIndex(item => item.stationuuid === id);
        if (index < 0) return null;
        const following = stations.length > 1 ? stations[(index + 1) % stations.length] : undefined;
        return <RadioStage key={id} station={stations[index]} next={following} onNext={following ? next : undefined} />;
      }}
    />
  );
};

const AudioUploadCard: React.FC<{ nft: GetNFTsResult; isVisible: boolean; desk?: boolean }> = ({
  nft,
  isVisible,
  desk = false,
}) => {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const tokenId = nft.tokenId ?? nft.id;
  // The API hands back the storage key ("feeds-audio/123-audio.mp3"), not a
  // link: the player needs the CDN host in front, the same as the feed card.
  const rawAudioUrl = (nft as any).audioUrl as string | undefined;
  const audioUrl = rawAudioUrl ? getAudioUrl(rawAudioUrl) : undefined;
  const glass = (theme === 'glass' || theme === 'system') && !!audioUrl && tokenId != null;
  const streamInfo = (nft as any).streamInfo;
  // Paid, gated and followers-only or direct tracks are private on the CDN;
  // fetch a signed link first.
  const requiresAccess = !!streamInfo?.isPayPerView
    || isHoldGated(streamInfo?.isLockContent, streamInfo?.lockAmount ?? streamInfo?.lockContentAmount)
    || !!(nft as any).plansDetails?.length
    || (nft as any).visibility === "followers"
    || (nft as any).visibility === "direct";
  const title = nft.name || (nft as any).title || t("copy.f59ab8d1331b", { defaultValue: "Untitled" });
  const creator =
    (nft as any).minterDisplayName || (nft as any).minterUsername || (nft as any).mintername || "";

  return (
    <View style={[styles.audioCard, glass && { backgroundColor: 'transparent', borderWidth: 0, padding: 0, borderRadius: 32 }, desk && { width: '100%' }]}>
      {!glass && <Text style={styles.audioTitle} numberOfLines={1}>
        {title}
      </Text>}
      {!glass && !!creator && (
        <Text style={styles.audioCreator} numberOfLines={1}>
          {creator}
        </Text>
      )}
      {audioUrl && tokenId != null ? (
        <AudioPostPlayer
          requiresAccess={requiresAccess}
          audioUrl={audioUrl}
          duration={(nft as any).audioDuration || 0}
          tokenId={tokenId}
          isVisible={isVisible}
          title={title}
          artist={creator || undefined}
          artworkUrl={nft.imageUrl || nft.thumbnailUrl ? getImageUrl(nft.imageUrl || nft.thumbnailUrl || '', 512) : undefined}
          compact={!glass}
        />
      ) : (
        <Text style={styles.shelfNote}>{t("music.noAudio")}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: TAB_BAR_CONTENT_INSET,
  },
  shelfNote: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    paddingHorizontal: FEED_SIDE,
  },
  rowWrap: {
    paddingHorizontal: FEED_SIDE,
  },
  subTabRow: {
    gap: 8,
    paddingHorizontal: FEED_SIDE,
    paddingTop: 4,
    paddingBottom: 10,
  },
  subTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  subTabOn: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  subTabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "500",
  },
  subTabTextOn: {
    color: "#FFFFFF",
  },
  radioChrome: {
    paddingBottom: 6,
  },
  searchWrap: {
    marginHorizontal: FEED_SIDE,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#FFFFFF",
    fontSize: 14,
    padding: 0,
  },
  genreRow: {
    gap: 8,
    paddingHorizontal: FEED_SIDE,
    paddingVertical: 10,
  },
  genrePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  genrePillOn: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  genreText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  genreTextOn: {
    color: "#FFFFFF",
  },
  loader: {
    paddingVertical: 24,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 56,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyNote: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    textAlign: "center",
  },
  audioCard: {
    width: AUDIO_CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    gap: 4,
  },
  audioTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  audioCreator: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    marginBottom: 4,
  },
});

export default React.memo(MusicFeed);
