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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import Icon, { type IconName } from "../ui/Icon";
import CompactVideoCard from "../Home/CompactVideoCard";
import AudioPostPlayer from "../Home/AudioPostPlayer";
import MusicVideoCard, { MUSIC_CARD_WIDTH } from "./MusicVideoCard";
import RadioStationCard from "./RadioStationCard";
import SectionHeader from "./SectionHeader";
import StagesCarousel from "./StagesCarousel";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useAuth } from "../../context/AuthContext";
import { getNFTs, type GetNFTsResult } from "../../services/nft.service";
import {
  RADIO_GENRES,
  getCuratedCarouselStations,
  getStationsByGenre,
  searchStations,
  type RadioGenreId,
  type RadioStation,
} from "../../libs/radio-browser";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";

const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

type MusicSubTab = "all" | "tracks" | "videos" | "podcasts" | "radio" | "stages";

// Same six, in web's order, so the tab you reach for is where you left it.
const SUB_TABS: { value: MusicSubTab; label: string; icon: IconName }[] = [
  { value: "all", label: "All", icon: "Music" },
  { value: "tracks", label: "Tracks", icon: "Disc3" },
  { value: "videos", label: "Videos", icon: "Play" },
  { value: "podcasts", label: "Podcasts", icon: "MicVocal" },
  { value: "radio", label: "Radio", icon: "Radio" },
  { value: "stages", label: "Stages", icon: "Mic" },
];

/** Shelves rendered under All, in web's order. */
type Shelf = "videos" | "radio" | "audio" | "stages" | "tracks" | "podcasts";
const ALL_SHELVES: Shelf[] = ["videos", "radio", "audio", "stages", "tracks", "podcasts"];

const CAROUSEL_PAGE_SIZE = 12;
const VIDEOS_PAGE_SIZE = 10;

export interface MusicFeedHandle {
  /** Tapping the logo goes to the top, the same as every other feed. */
  scrollToTop: () => void;
}

export interface MusicFeedProps {
  headerInset?: number;
  scrollHandler?: any;
  onScrollBegin?: () => void;
  onScrollEnd?: () => void;
  onRefresh?: () => void;
  feedRef?: React.MutableRefObject<MusicFeedHandle | null>;
}

// ── Shelves ─────────────────────────────────────────────────────────────────

const HorizontalShelf: React.FC<{
  data: any[];
  keyFor: (item: any, index: number) => string;
  render: (item: any) => React.ReactElement;
  itemWidth: number;
}> = ({ data, keyFor, render, itemWidth }) => {
  // Blocks Home's page-turn gesture while this shelf is scrolling, so a
  // sideways drag here moves the shelf instead of switching feed tabs.
  const scrollGuard = useHorizontalScrollGuard();
  const list = (
    <FlatList
      data={data}
      keyExtractor={keyFor}
      renderItem={({ item }) => render(item)}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      initialNumToRender={3}
      windowSize={3}
      contentContainerStyle={styles.shelfContent}
      getItemLayout={(_, index) => ({
        length: itemWidth + 12,
        offset: (itemWidth + 12) * index,
        index,
      })}
    />
  );
  return scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list;
};

/**
 * Wraps a horizontally-scrolling child so it blocks Home's page-turn gesture
 * while it is scrolling. Same job HorizontalShelf does for itself, for the
 * chrome rows that are not shelves.
 */
const GuardedRow: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const scrollGuard = useHorizontalScrollGuard();
  return scrollGuard ? <GestureDetector gesture={scrollGuard}>{children}</GestureDetector> : children;
};

const ShelfSkeleton: React.FC<{ width: number; height: number }> = ({ width, height }) => (
  // Explicitly a row: shelfContent is a FlatList contentContainerStyle, which
  // the horizontal list lays out sideways for itself. A plain View would stack
  // these three down the page.
  <View style={[styles.shelfContent, styles.skeletonRow]}>
    {[0, 1, 2].map((i) => (
      <View key={i} style={[styles.skeleton, { width, height }]} />
    ))}
  </View>
);

const EmptyShelf: React.FC<{ icon: IconName; title: string; note: string }> = ({
  icon,
  title,
  note,
}) => (
  <View style={styles.section}>
    <SectionHeader icon={icon} title={title} />
    <Text style={styles.shelfNote}>{note}</Text>
  </View>
);

// ── The tab ─────────────────────────────────────────────────────────────────

const MusicFeed: React.FC<MusicFeedProps> = ({
  headerInset = 0,
  scrollHandler,
  onScrollBegin,
  onScrollEnd,
  onRefresh,
  feedRef,
}) => {
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
  const [genre, setGenre] = useState<RadioGenreId>("top");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { user } = useAuth();
  const address = user?.walletAddress || user?.address || undefined;

  const isSearchingRadio = debouncedSearch.trim().length > 0;

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: carouselVideos = [], isLoading: loadingCarouselVideos } = useQuery({
    queryKey: ["music-videos-carousel", address],
    queryFn: async () => {
      const res = await getNFTs({
        category: "Music",
        postType: "video",
        unit: CAROUSEL_PAGE_SIZE,
        sortMode: "popular",
        address,
      });
      return res.result || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: audioUploads = [], isLoading: loadingAudio } = useQuery({
    queryKey: ["music-audio-uploads", address],
    queryFn: async () => {
      const res = await getNFTs({
        postType: "feed-audio",
        unit: CAROUSEL_PAGE_SIZE,
        sortMode: "new",
        address,
      });
      return res.result || [];
    },
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
    () => musicVideos.data?.pages.flatMap((p) => p.items) ?? [],
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
            <View style={styles.section}>
              <SectionHeader
                icon="Play"
                title="Music Videos"
                onSeeAll={carouselVideos.length ? () => setTab("videos") : undefined}
              />
              {loadingCarouselVideos ? (
                <ShelfSkeleton width={MUSIC_CARD_WIDTH} height={168} />
              ) : carouselVideos.length === 0 ? (
                <Text style={styles.shelfNote}>No music videos yet</Text>
              ) : (
                <HorizontalShelf
                  data={carouselVideos}
                  itemWidth={MUSIC_CARD_WIDTH}
                  keyFor={(item: GetNFTsResult, i) => String(item.tokenId ?? item.id ?? i)}
                  render={(item: GetNFTsResult) => <MusicVideoCard nft={item} />}
                />
              )}
            </View>
          );
        case "radio":
          return (
            <View style={styles.section}>
              <SectionHeader
                icon="Radio"
                title="Radio Stations"
                onSeeAll={() => setTab("radio")}
              />
              {curatedStations.length === 0 ? (
                <ShelfSkeleton width={260} height={76} />
              ) : (
                <HorizontalShelf
                  data={curatedStations}
                  itemWidth={260}
                  keyFor={(item: RadioStation) => item.stationuuid}
                  render={(item: RadioStation) => (
                    <RadioStationCard station={item} variant="card" />
                  )}
                />
              )}
            </View>
          );
        case "audio":
          return (
            <View style={styles.section}>
              <SectionHeader icon="Disc3" title="Audio Uploads" count={audioUploads.length} />
              {loadingAudio ? (
                <ShelfSkeleton width={280} height={124} />
              ) : audioUploads.length === 0 ? (
                <Text style={styles.shelfNote}>No audio uploads yet</Text>
              ) : (
                <AudioUploadsShelf items={audioUploads} />
              )}
            </View>
          );
        case "stages":
          return <StagesCarousel />;
        case "tracks":
          return <EmptyShelf icon="Disc3" title="Tracks" note="No tracks yet" />;
        case "podcasts":
          return <EmptyShelf icon="MicVocal" title="Podcasts" note="No podcasts yet" />;
      }
    },
    [carouselVideos, loadingCarouselVideos, curatedStations, audioUploads, loadingAudio],
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
          renderItem: () => <StagesCarousel />,
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
                accessibilityLabel={item.label}
              >
                <Icon
                  name={item.icon}
                  size={13}
                  color={active ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
                />
                <Text style={[styles.subTabText, active && styles.subTabTextOn]}>
                  {item.label}
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
                placeholder="Search 50,000+ radio stations..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
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
    [headerInset, tab, search, genre, isSearchingRadio],
  );

  const listEmpty = useMemo(() => {
    if (tab === "tracks" || tab === "podcasts") {
      return (
        <View style={styles.empty}>
          <Icon name={tab === "tracks" ? "Disc3" : "MicVocal"} size={26} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No {tab} yet</Text>
          <Text style={styles.emptyNote}>
            Music content will appear here once creators start uploading.
          </Text>
        </View>
      );
    }
    if (tab === "radio") {
      if (loadingStations) return <ActivityIndicator style={styles.loader} color="#FFFFFF" />;
      return (
        <View style={styles.empty}>
          <Icon name="Radio" size={26} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>
            {isSearchingRadio ? "No stations found" : "No stations available"}
          </Text>
          <Text style={styles.emptyNote}>
            {isSearchingRadio ? "Try a different search term." : "Try another genre."}
          </Text>
        </View>
      );
    }
    if (tab === "videos") {
      if (musicVideos.isLoading) return <ActivityIndicator style={styles.loader} color="#FFFFFF" />;
      return (
        <View style={styles.empty}>
          <Icon name="Play" size={26} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No music videos yet</Text>
        </View>
      );
    }
    return null;
  }, [tab, loadingStations, isSearchingRadio, musicVideos.isLoading]);

  return (
    <AnimatedFlatList
      ref={listRef as any}
      data={data}
      keyExtractor={keyExtractor as any}
      renderItem={renderItem as any}
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
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#FFFFFF"
          progressViewOffset={headerInset}
        />
      }
    />
  );
};

const AUDIO_CARD_WIDTH = 280;

/**
 * The audio shelf owns its own list because its cards need to know which of
 * them is on screen. AudioPostPlayer downloads its track as soon as it is told
 * it is visible, so handing every rendered card a blanket `isVisible` would
 * pull half a dozen audio files down for a shelf nobody has touched. Only what
 * the shelf has actually settled on counts.
 */
const AudioUploadsShelf: React.FC<{ items: GetNFTsResult[] }> = ({ items }) => {
  const scrollGuard = useHorizontalScrollGuard();
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(() => new Set());

  // Both must be stable for the lifetime of the list — FlatList throws on a
  // changed onViewableItemsChanged.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ key: string }> }) => {
      setVisibleIds(new Set(viewableItems.map((v) => v.key)));
    },
  ).current;

  const list = (
    <FlatList
      data={items}
      keyExtractor={(item, i) => String(item.tokenId ?? item.id ?? i)}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      initialNumToRender={2}
      windowSize={3}
      contentContainerStyle={styles.shelfContent}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={({ item, index }) => (
        <AudioUploadCard
          nft={item}
          isVisible={visibleIds.has(String(item.tokenId ?? item.id ?? index))}
        />
      )}
      extraData={visibleIds}
    />
  );

  return scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list;
};

/**
 * An audio post on the shelf: title, creator, and the same compact player the
 * feed card uses, so a track can be heard without opening it.
 */
const AudioUploadCard: React.FC<{ nft: GetNFTsResult; isVisible: boolean }> = ({
  nft,
  isVisible,
}) => {
  const tokenId = nft.tokenId ?? nft.id;
  const audioUrl = (nft as any).audioUrl as string | undefined;
  const title = nft.name || (nft as any).title || "Untitled";
  const creator =
    (nft as any).minterDisplayName || (nft as any).minterUsername || (nft as any).mintername || "";

  return (
    <View style={styles.audioCard}>
      <Text style={styles.audioTitle} numberOfLines={1}>
        {title}
      </Text>
      {!!creator && (
        <Text style={styles.audioCreator} numberOfLines={1}>
          {creator}
        </Text>
      )}
      {audioUrl && tokenId != null ? (
        <AudioPostPlayer
          audioUrl={audioUrl}
          duration={(nft as any).audioDuration || 0}
          tokenId={tokenId}
          listens={(nft as any).listens || 0}
          isVisible={isVisible}
          compact
        />
      ) : (
        <Text style={styles.shelfNote}>No audio</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: TAB_BAR_CONTENT_INSET,
  },
  section: {
    marginBottom: 20,
  },
  shelfContent: {
    gap: 12,
    paddingHorizontal: 12,
  },
  shelfNote: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    paddingHorizontal: 12,
  },
  skeleton: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  skeletonRow: {
    flexDirection: "row",
    overflow: "hidden",
  },
  rowWrap: {
    paddingHorizontal: 12,
  },
  subTabRow: {
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginHorizontal: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  genrePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
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
