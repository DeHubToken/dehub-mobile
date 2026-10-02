/**
 * CinematicMusic — the Music tab on phones in the System theme
 * ============================================================
 * Port of web's `components/app/music/CinematicMusic`: one big "on air"
 * station with a Listen button, a row of chips, then a numbered chart with
 * thin lines between rows. Tablets and the other themes keep MusicFeed.
 *
 * One Animated list, like MusicFeed, so HomeScreen's scroll handler keeps
 * sliding the capsule away and back.
 *
 * @module components/Music/CinematicMusic
 */

import { isVisibleInMusic } from "./music-curation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Icon from "../ui/Icon";
import ChromeSurface from "../ui/ChromeSurface";
import StagesCarousel from "./StagesCarousel";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useAuth } from "../../context/AuthContext";
import { useAppTheme } from "../../context/ThemeContext";
import { getNFTs, type GetNFTsResult } from "../../services/nft.service";
import {
  getCuratedCarouselStations,
  getPrimaryTags,
  type RadioStation,
} from "../../libs/radio-browser";
import { toggleRadioStation, useRadioPlayer } from "../../libs/radio-player";
import { getImageUrl } from "../../libs/misc";
import { secondsToHMMSS } from "../../libs/date.util";
import { storage } from "../../libs/storage";
import { SHARE_ORIGIN } from "../../libs/dehub-links";
import { ScreenNames } from "../../navigation/ScreenNames";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { ISLAND_BAR_HEIGHT } from "../Home/IslandTopBar";
import type { MusicFeedHandle } from "./MusicFeed";

const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

type Chip = "top" | "radio" | "stages" | "new";

const CHIPS: { key: Chip; label: string }[] = [
  { key: "top", label: "music.top50" },
  { key: "radio", label: "music.radio" },
  { key: "stages", label: "nav.stages" },
  { key: "new", label: "communities.sort.new" },
];

const LIKED_STATIONS_KEY = "dehub.likedStations";
const CHART_SIZE = 50;
const THUMB = 48;
const SIDE = 14;
const HAIRLINE = "rgba(255,255,255,0.12)";
const MUTED = "#A1A1AA";
const DIM = "#71717A";
/** The station logo sits under the capsule: web's safe area + 4.5rem. */
const HERO_LOGO_TOP = ISLAND_BAR_HEIGHT + 20;
const HERO_LOGO = 144;
const HERO_MAX = 460;

function readLikedStations(): string[] {
  try {
    const raw = storage.getString(LIKED_STATIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Web's formatViews without the word: 950, 1.2K, 3.4M. */
export function compactCount(count?: number): string {
  if (!count) return "0";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

// ── White buttons ───────────────────────────────────────────────────────────
//
// Web draws Listen and the active chip white with black text. The app's JSX
// pass (libs/jsx/controls) repaints any pressable with a neutral fill, and its
// neutral labels, in the theme's control material, which turned both grey.
// These faces draw the fill and the label inside a component of their own, so
// the pressable itself carries no fill and nothing for that pass to repaint.

const ListenFace: React.FC<{ playing: boolean; loading: boolean; label: string }> = ({ playing, loading, label }) => (
  <>
    <View style={[StyleSheet.absoluteFill, styles.whiteFill, { borderRadius: 10 }]} />
    {loading ? (
      <ActivityIndicator size="small" color="#000000" />
    ) : (
      <View>
        <Icon name={playing ? "Pause" : "Play"} size={18} color="#000000" fill="#000000" />
      </View>
    )}
    <Text style={styles.listenText}>{label}</Text>
  </>
);

const ChipFace: React.FC<{ on: boolean; label: string }> = ({ on, label }) => (
  <>
    {on ? (
      <View style={[StyleSheet.absoluteFill, styles.whiteFill, { borderRadius: 12 }]} />
    ) : (
      <ChromeSurface radius={12} tinted />
    )}
    <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
  </>
);

// ── Hero ────────────────────────────────────────────────────────────────────

const RadioHero: React.FC<{ station: RadioStation; height: number }> = ({ station, height }) => {
  const { t } = useTranslation();
  const { station: current, isPlaying, isLoading } = useRadioPlayer();
  const [liked, setLiked] = useState(() => readLikedStations().includes(station.stationuuid));
  const [failedLogoUri, setFailedLogoUri] = useState<string | null>(null);

  const isCurrent = current?.stationuuid === station.stationuuid;
  const playing = isCurrent && isPlaying;
  const loading = isCurrent && isLoading;
  const logo = failedLogoUri === station.favicon || !station.favicon ? undefined : station.favicon;
  const tags = getPrimaryTags(station.tags, 3);

  const listen = useCallback(() => toggleRadioStation(station), [station]);

  const toggleLike = useCallback(() => {
    const next = !liked;
    setLiked(next);
    try {
      const ids = readLikedStations().filter((id) => id !== station.stationuuid);
      if (next) ids.push(station.stationuuid);
      storage.set(LIKED_STATIONS_KEY, JSON.stringify(ids));
    } catch {
      // Storage unavailable: the heart still toggles for this visit.
    }
  }, [liked, station.stationuuid]);

  const share = useCallback(() => {
    const url = `${SHARE_ORIGIN}/app`;
    const text = t("music.listeningTo", { name: station.name });
    // iOS reads `url` on its own; Android only reads `message`.
    Share.share({ title: station.name, message: `${text} ${url}`, url }).catch(() => {
      // Share sheet dismissed.
    });
  }, [station.name, t]);

  return (
    <View style={[styles.hero, { height }]}>
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={[StyleSheet.absoluteFill, styles.heroBackdrop]}
          contentFit="cover"
          blurRadius={40}
          onError={() => setFailedLogoUri(station.favicon)}
        />
      ) : null}
      <LinearGradient
        colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.88)"]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.heroLogoRow} pointerEvents="none">
        <View style={styles.heroLogo}>
          {logo ? (
            <Image
              source={{ uri: logo }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={station.name}
              onError={() => setFailedLogoUri(station.favicon)}
            />
          ) : (
            <Icon name="Radio" size={48} color={DIM} />
          )}
        </View>
      </View>

      <View style={styles.heroInfo}>
        <View style={styles.heroMetaRow}>
          <View style={styles.onAir}>
            <Icon name="Radio" size={12} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.onAirText}>{t("liveShop.onAir")}</Text>
          </View>
          {station.clickcount > 0 ? (
            <View style={styles.plays}>
              <Icon name="Headphones" size={12} color="#E4E4E7" />
              <Text style={styles.playsText}>
                {t("music.playsToday", { plays: compactCount(station.clickcount) })}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroName} numberOfLines={2}>
          {station.name}
        </Text>
        {tags.length > 0 ? <Text style={styles.heroTags}>{tags.join(" · ")}</Text> : null}
        <View style={styles.heroActions}>
          <Pressable
            onPress={listen}
            accessibilityRole="button"
            style={({ pressed }) => [styles.listen, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ListenFace
              playing={playing}
              loading={loading}
              label={playing ? t("audioPost.pause") : t("music.listen")}
            />
          </Pressable>
          <Pressable
            onPress={toggleLike}
            accessibilityRole="button"
            accessibilityLabel={liked ? t("music.unlikeStation") : t("music.likeStation")}
            accessibilityState={{ selected: liked }}
            style={styles.glassSquare}
          >
            <ChromeSurface radius={10} tinted />
            <View>
              <Icon
                name="Heart"
                size={20}
                color={liked ? "#EF4444" : "#FFFFFF"}
                fill={liked ? "#EF4444" : undefined}
              />
            </View>
          </Pressable>
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel={t("music.shareStation")}
            style={styles.glassSquare}
          >
            <ChromeSurface radius={10} tinted />
            <View>
              <Icon name="Share2" size={20} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ── Chart ───────────────────────────────────────────────────────────────────

const ChartRow: React.FC<{
  rank: number;
  image?: string;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
  /** The row that is playing: its title takes the theme's accent. */
  activeColor?: string;
  onPress: () => void;
}> = ({ rank, image, title, subtitle, trailing, activeColor, onPress }) => {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={[styles.rank, { color: rank <= 3 ? "#FFFFFF" : DIM }]}>{rank}</Text>
      <View style={styles.thumb}>
        {image && !failed ? (
          <Image
            source={{ uri: image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            onError={() => setFailed(true)}
          />
        ) : (
          <Icon name="Radio" size={20} color={DIM} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, activeColor ? { color: activeColor } : null]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {trailing != null ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
};

const ChartSkeleton: React.FC = () => (
  <View>
    {Array.from({ length: 6 }).map((_, i) => (
      <View key={i} style={styles.row}>
        <View style={[styles.skeleton, { width: 22, height: 16 }]} />
        <View style={[styles.skeleton, { width: THUMB, height: THUMB, borderRadius: 8 }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.skeleton, { width: "66%", height: 14 }]} />
          <View style={[styles.skeleton, { width: "33%", height: 12 }]} />
        </View>
      </View>
    ))}
  </View>
);

const SectionTitle: React.FC<{ title: string; action?: string; onAction?: () => void }> = ({
  title,
  action,
  onAction,
}) => (
  <View style={styles.sectionTitle}>
    <Text style={styles.sectionTitleText}>{title}</Text>
    {action ? (
      <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    ) : null}
  </View>
);

/** A chart row's data, flattened from a post. */
interface Track {
  id: string;
  thumbnail: string;
  title: string;
  channel: string;
  views: number;
  duration?: string;
}

function toTrack(nft: GetNFTsResult): Track | null {
  const tokenId = nft.tokenId ?? nft.id;
  if (tokenId == null || !isVisibleInMusic(nft)) return null;
  const any = nft as any;
  const rawThumb = any.thumbnail || nft.thumbnailUrl || nft.imageUrl || "";
  const seconds = any.postType === "feed-audio" ? any.audioDuration || nft.videoDuration : nft.videoDuration;
  const duration = seconds ? secondsToHMMSS(seconds) : undefined;
  return {
    id: String(tokenId),
    thumbnail: rawThumb ? getImageUrl(rawThumb, THUMB) : "",
    title: nft.name || any.title || String(any.description || "").split("\n")[0] || "",
    channel: any.minterDisplayName || any.minterUsername || any.mintername || "Anonymous",
    views: Number(any.views ?? any.totalViews ?? 0) || 0,
    duration: duration && duration !== "00:00" && duration !== "0:00" ? duration : undefined,
  };
}

function useMusicChart(mode: "views" | "createdAt", enabled: boolean, address?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["music-chart", mode, address],
    queryFn: async () => {
      const res = await getNFTs({
        category: "Music",
        unit: CHART_SIZE,
        sortBy: mode,
        sortOrder: "desc",
        address,
      } as any);
      return res.result || [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });
  const items = useMemo(
    () => (data || []).map(toTrack).filter((x): x is Track => !!x),
    [data],
  );
  return { items, isLoading: enabled && isLoading };
}

// ── The tab ─────────────────────────────────────────────────────────────────

type Row = { kind: "track"; track: Track } | { kind: "station"; station: RadioStation };

export interface CinematicMusicProps {
  active?: boolean;
  scrollHandler?: any;
  onScrollBegin?: () => void;
  onScrollEnd?: () => void;
  onRefresh?: () => void;
  feedRef?: React.MutableRefObject<MusicFeedHandle | null>;
}

const CinematicMusic: React.FC<CinematicMusicProps> = ({
  active = true,
  scrollHandler,
  onScrollBegin,
  onScrollEnd,
  onRefresh,
  feedRef,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(Math.round(width * 1.18), HERO_MAX);
  const listRef = useRef<FlatList<any> | null>(null);
  const [chip, setChip] = useState<Chip>("top");
  const { user } = useAuth();
  const address = user?.walletAddress || user?.address || undefined;
  const { station: currentStation, isPlaying } = useRadioPlayer();
  const { accent } = useAppTheme();
  const accentColor = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

  useEffect(() => {
    if (!feedRef) return;
    feedRef.current = {
      scrollToTop: () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    };
    return () => {
      feedRef.current = null;
    };
  }, [feedRef]);

  const { data: radioStations = [] } = useQuery({
    queryKey: ["radio-stations-curated"],
    queryFn: () => getCuratedCarouselStations(),
    staleTime: 10 * 60_000,
  });
  const top = useMusicChart("views", chip === "top", address);
  const fresh = useMusicChart("createdAt", chip === "new", address);

  // The station on air in the hero: whatever is playing, else the first pick.
  const heroStation = (isPlaying && currentStation) || radioStations[0];

  const openPost = useCallback(
    (track: Track) => navigation.navigate(ScreenNames.FeedDetail, { tokenId: track.id, postId: track.id }),
    [navigation],
  );

  const scrollGuard = useHorizontalScrollGuard();
  const chipRow = (
    <FlatList
      horizontal
      data={CHIPS}
      keyExtractor={(c) => c.key}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      renderItem={({ item: c }) => {
        const on = chip === c.key;
        return (
          <Pressable
            onPress={() => setChip(c.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={styles.chip}
          >
            <ChipFace on={on} label={t(c.label)} />
          </Pressable>
        );
      }}
    />
  );

  const list = chip === "top" ? top : chip === "new" ? fresh : null;
  const rows: Row[] = useMemo(() => {
    if (list) return list.isLoading ? [] : list.items.map((track) => ({ kind: "track" as const, track }));
    if (chip === "radio") return radioStations.map((station) => ({ kind: "station" as const, station }));
    return [];
  }, [list, chip, radioStations]);

  const sectionTitle =
    chip === "top" ? t("music.top50") : chip === "new" ? t("music.newReleases") : chip === "radio" ? t("music.radioStations") : "";

  const header = (
    <View>
      {heroStation ? (
        <RadioHero key={heroStation.stationuuid} station={heroStation} height={heroHeight} />
      ) : (
        <View style={[styles.hero, { height: heroHeight, backgroundColor: "#18181B" }]} />
      )}
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{chipRow}</GestureDetector> : chipRow}
      {chip !== "stages" ? (
        <>
          <SectionTitle
            title={sectionTitle}
            action={list && list.items.length > 0 ? t("music.playAll") : undefined}
            onAction={() => list?.items[0] && openPost(list.items[0])}
          />
          <View style={styles.topRule} />
        </>
      ) : (
        <View style={{ paddingTop: 20 }}>
          <StagesCarousel />
        </View>
      )}
    </View>
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Row>) => {
      if (item.kind === "track") {
        const { track } = item;
        return (
          <ChartRow
            rank={index + 1}
            image={track.thumbnail}
            title={track.title || t("work.untitled")}
            subtitle={track.views ? `${track.channel} · ${t("comments.viewCount", { count: track.views }).replace(String(track.views), compactCount(track.views))}` : track.channel}
            trailing={track.duration ? <Text style={styles.trailingText}>{track.duration}</Text> : undefined}
            onPress={() => openPost(track)}
          />
        );
      }
      const { station } = item;
      const on = currentStation?.stationuuid === station.stationuuid && isPlaying;
      return (
        <ChartRow
          rank={index + 1}
          image={station.favicon || undefined}
          title={station.name}
          subtitle={getPrimaryTags(station.tags).join(", ") || t("music.radio")}
          activeColor={on ? accentColor : undefined}
          trailing={<Icon name={on ? "Pause" : "Play"} size={16} color={MUTED} fill={MUTED} />}
          onPress={() => toggleRadioStation(station)}
        />
      );
    },
    [currentStation?.stationuuid, isPlaying, openPost, accentColor, t],
  );

  const empty =
    chip === "stages" ? null : (list?.isLoading || (chip === "radio" && radioStations.length === 0)) ? (
      <ChartSkeleton />
    ) : (
      <Text style={styles.empty}>{t("music.nothingHereYet")}</Text>
    );

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
  }, [onRefresh, queryClient]);

  return (
    <View style={styles.root}>
      <AnimatedFlatList
        ref={listRef as any}
        data={rows}
        keyExtractor={(row: Row) => (row.kind === "track" ? `t-${row.track.id}` : `s-${row.station.stationuuid}`)}
        renderItem={renderItem as any}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        onScrollBeginDrag={onScrollBegin}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={24}
        refreshControl={
          <DeHubRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FFFFFF"
            progressViewOffset={ISLAND_BAR_HEIGHT}
          />
        }
      />
      <DeHubRefreshMark pill={active} refreshing={refreshing} topInset={ISLAND_BAR_HEIGHT} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: TAB_BAR_CONTENT_INSET + 64 },
  hero: { width: "100%", overflow: "hidden", backgroundColor: "#09090B" },
  heroBackdrop: { opacity: 0.7, transform: [{ scale: 1.25 }] },
  heroLogoRow: { position: "absolute", left: 0, right: 0, top: HERO_LOGO_TOP, alignItems: "center" },
  heroLogo: {
    width: HERO_LOGO,
    height: HERO_LOGO,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#27272A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  heroInfo: { position: "absolute", left: SIDE, right: SIDE, bottom: 16 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  onAir: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  onAirText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  plays: { flexDirection: "row", alignItems: "center", gap: 4 },
  playsText: { color: "#E4E4E7", fontSize: 12, ...textShadow() },
  heroName: { marginTop: 8, color: "#FFFFFF", fontSize: 26, lineHeight: 32, fontWeight: "700", ...textShadow() },
  heroTags: { marginTop: 4, color: "#E4E4E7", fontSize: 13, textTransform: "capitalize", ...textShadow() },
  heroActions: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  listen: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 18,
  },
  listenText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  glassSquare: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chips: { gap: 8, paddingHorizontal: SIDE, paddingTop: 14 },
  chip: { height: 36, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  whiteFill: { backgroundColor: "#FFFFFF" },
  chipText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: "#000000" },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: SIDE,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitleText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  sectionAction: { color: MUTED, fontSize: 13, fontWeight: "500" },
  topRule: { height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: SIDE,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HAIRLINE,
  },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  rank: { width: 22, textAlign: "center", fontSize: 16, fontWeight: "700" },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#27272A",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  rowSubtitle: { marginTop: 2, color: MUTED, fontSize: 12 },
  trailing: { flexShrink: 0 },
  trailingText: { color: MUTED, fontSize: 12 },
  skeleton: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 4 },
  empty: { paddingHorizontal: SIDE, paddingVertical: 32, textAlign: "center", color: DIM, fontSize: 14 },
});

function textShadow() {
  return {
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as const;
}

export default React.memo(CinematicMusic);
