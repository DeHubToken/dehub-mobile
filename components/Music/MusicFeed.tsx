import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { useSearchFieldMaterial, SEARCH_INPUT_CLEAR } from '../../hooks/useSearchFieldMaterial';
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
import FeedCard from "../Home/FeedCard";
import GlassIndicator from "../ui/GlassIndicator";
import RadioStationCard from "./RadioStationCard";
import { FEED_SIDE } from "../Home/feedLayout";
import StagesChart from "./StagesChart";
import ChartShelf, { type ChartShelfRow } from "./ChartShelf";
import { useChartSearch } from "../../hooks/useChartSearch";
import RadioStage from "./RadioStage";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useAuth } from "../../context/AuthContext";
import { getNFTs, type GetNFTsResult } from "../../services/nft.service";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { MUSIC_SEARCH_SIZE, searchRadio } from "../../libs/music-search";
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
import { getImageUrl } from "../../libs/misc";
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
// How many matches a chart search pulls from its whole zone.
const CHART_SEARCH_SIZE = MUSIC_SEARCH_SIZE;
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
  const [audioSearch, setAudioSearch] = useState("");
  const [videoSearch, setVideoSearch] = useState("");
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 10, minimumViewTime: 150 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ key: string }> }) => {
    setVisibleIds(new Set(viewableItems.map(item => item.key)));
  }).current;
  const [genre, setGenre] = useState<RadioGenreId>("top");
  const [search, setSearch] = useSurfaceDraft("components/Music/MusicFeed.tsx:search", "");
  const searchMaterial = useSearchFieldMaterial();
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

  // Chart searches reach every audio upload and music video, not just the chart.
  const audioFound = useChartSearch("audio", audioSearch, async query =>
    ((await getNFTs({ postType: "feed-audio", search: query, unit: CHART_SEARCH_SIZE, sortMode: "trending", address })).result || []).filter(isVisibleInMusic));
  const videoFound = useChartSearch("music-videos", videoSearch, async query =>
    ((await getNFTs({ category: "Music", postType: "video", search: query, unit: CHART_SEARCH_SIZE, sortMode: "trending", address })).result || []).filter(isVisibleInMusic));

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

  const videoRow = useCallback((item: GetNFTsResult, index: number): ChartShelfRow => {
    const creator = (item as any).minterDisplayName || (item as any).minterUsername || (item as any).mintername || "";
    const views = resolveViewCount(item);
    const rawThumb = (item as any).thumbnail || item.thumbnailUrl || item.imageUrl || "";
    return {
      id: String(item.tokenId ?? item.id ?? index),
      title: item.name || (item as any).title || "",
      subtitle: [creator, views ? t("music.viewsCount", { count: views, views: formatCompactNumber(views) }) : ""].filter(Boolean).join(" · "),
      thumb: rawThumb ? getImageUrl(rawThumb, 160) : undefined,
      trailing: chartDuration(item.videoDuration),
    };
  }, [t]);
  const audioRow = useCallback((item: GetNFTsResult, index: number): ChartShelfRow => ({
    id: String(item.tokenId ?? item.id ?? index),
    // Web's mapNFTToVideoItem: a post with no name is titled by its caption's first line.
    title: item.name?.trim() || (item as any).title || (item as any).description?.split("\n")[0] || "",
    subtitle: (item as any).minterDisplayName || (item as any).minterUsername || (item as any).mintername || "",
    trailing: chartDuration((item as any).audioDuration || item.videoDuration),
  }), []);

  const renderShelf = useCallback(
    (shelf: Shelf) => {
      switch (shelf) {
        case "videos":
          return (
            <ChartShelf
              icon="Play"
              title={t("music.musicVideos")}
              sorts={MUSIC_VIDEO_CHART_SORTS.map(option => ({ value: option.value, label: t(option.key, { defaultValue: option.fallback }) }))}
              sort={videoChartSort}
              onSort={setVideoChartSort}
              rows={videoChart.map(videoRow)}
              search={videoSearch}
              onSearchChange={setVideoSearch}
              moreRows={videoFound.items.map(videoRow)}
              searchingMore={videoFound.isSearching}
              loading={loadingVideoChart}
              emptyText={t("music.noMusicVideos")}
              thumbs="wide"
              renderSelected={id => {
                const item = videoChart.find((nft, index) => String(nft.tokenId ?? nft.id ?? index) === id)
                  || videoFound.items.find((nft, index) => String(nft.tokenId ?? nft.id ?? index) === id);
                return item ? <DeskPost nft={item} isVisible={active && visibleIds.has("shelf-videos")} /> : null;
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
              rows={audioUploads.map(audioRow)}
              search={audioSearch}
              onSearchChange={setAudioSearch}
              moreRows={audioFound.items.map(audioRow)}
              searchingMore={audioFound.isSearching}
              loading={loadingAudio}
              emptyText={t("music.noAudioUploads")}
              renderSelected={id => {
                const item = audioUploads.find((nft, index) => String(nft.tokenId ?? nft.id ?? index) === id)
                  || audioFound.items.find((nft, index) => String(nft.tokenId ?? nft.id ?? index) === id);
                return item ? <DeskPost nft={item} isVisible={active && visibleIds.has("shelf-audio")} /> : null;
              }}
            />
          );
        case "stages":
          return <StagesChart />;
      }
    },
    [curatedStations, audioUploads, loadingAudio, active, visibleIds, chartSort, videoChart, loadingVideoChart, videoChartSort, t,
      audioSearch, audioFound, videoSearch, videoFound, audioRow, videoRow],
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
                style={styles.subTab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(item.label)}
              >
                {/* Web: one GlassIndicator under the picked tab, the rest bare text. */}
                {active && <GlassIndicator borderRadius={8} />}
                <Icon
                  name={item.icon}
                  size={14}
                  color={active ? "#FFFFFF" : SUB_TAB_IDLE}
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
            <View style={[styles.searchWrap, searchMaterial.surface]}>
              <Icon name="Search" size={15} color="rgba(255,255,255,0.4)" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("music.searchRadio")}
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={[styles.searchInput, SEARCH_INPUT_CLEAR]}
                onFocus={searchMaterial.onFocus}
                onBlur={searchMaterial.onBlur}
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

/** Web's `text-zinc-500` on idle sub-tabs. */
const SUB_TAB_IDLE = "#71717a";

/** Web's formatDuration: 6:42, 1:02:03; nothing when unknown. */
function chartDuration(seconds?: number | null): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * The picked track or music video: the same post card as the feed, minus its
 * bento and action bar, like web's `<VideoCard hideActions />` in the chart.
 */
const DeskPost: React.FC<{ nft: GetNFTsResult; isVisible: boolean }> = ({ nft, isVisible }) => (
  <FeedCard item={nft as unknown as UnifiedFeedItem} desk isVisible={isVisible} isAutoplayActive={isVisible} />
);

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
  const [search, setSearch] = useState("");
  const found = useChartSearch("radio", search, searchRadio);
  const chartStations = useMemo(() => {
    if (sort === "picks") return curated;
    const field = sort === "played" ? "clickcount" : sort === "voted" ? "votes" : "clicktrend";
    return [...top].sort((a, b) => (b[field] || 0) - (a[field] || 0)).slice(0, 20);
  }, [sort, curated, top]);
  // Skipping walks the list as shown, search matches from the directory included.
  const stations = useMemo(() => {
    if (!search.trim()) return chartStations;
    const seen = new Set(chartStations.map(s => s.stationuuid));
    return [...chartStations, ...found.items.filter(s => !seen.has(s.stationuuid))];
  }, [chartStations, found.items, search]);
  const stationRow = (station: RadioStation): ChartShelfRow => ({
    id: station.stationuuid,
    title: station.name.trim(),
    // Web: "chillout, lofi · US".
    subtitle: [getPrimaryTags(station.tags).join(", "), station.countrycode].filter(Boolean).join(" · "),
    thumb: station.favicon || undefined,
  });
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
      rows={chartStations.map(stationRow)}
      search={search}
      onSearchChange={setSearch}
      moreRows={found.items.map(stationRow)}
      searchingMore={found.isSearching}
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

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: TAB_BAR_CONTENT_INSET,
  },
  rowWrap: {
    paddingHorizontal: FEED_SIDE,
  },
  // Web: `px-2 pb-2` around `flex gap-1.5 pl-1 py-1`.
  subTabRow: {
    gap: 6,
    paddingLeft: FEED_SIDE + 4,
    paddingRight: FEED_SIDE,
    paddingVertical: 4,
    marginBottom: 8,
  },
  // `px-3 py-1.5 rounded-lg text-xs font-medium`, icon 14.
  subTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  subTabText: {
    color: SUB_TAB_IDLE,
    fontSize: 12,
    lineHeight: 16,
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
});

export default React.memo(MusicFeed);
