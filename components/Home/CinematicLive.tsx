/**
 * CinematicLive — the Live tab on phones in the System theme
 * ==========================================================
 * Port of web's `components/app/feeds/CinematicLive`: who is live now as a
 * row of avatars, the top games as a row of box art, then every stream in a
 * two-column grid, with Stages and TV underneath. Tablets and the other themes
 * keep the Live feed list.
 *
 * One Animated list (the grid is its two-column body), so HomeScreen's scroll
 * handler keeps sliding the capsule away and back.
 *
 * @module components/Home/CinematicLive
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
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
import StagesCarousel from "../Music/StagesCarousel";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { getLiveVideos, type LiveStreamEntity } from "../../services/live.service";
import { getTVChannelsByCountry, type TVChannel } from "../../services/liveTv.service";
import { isStreamLive } from "../../libs/live-status";
import { liveThumbnailFor } from "../../libs/live-ingest";
import { buildCdnPath, getAvatarUrl } from "../../libs/misc";
import { LIVE_GAMES, streamMatchesGame, type LiveGame } from "../../libs/live-games";
import { ScreenNames } from "../../navigation/ScreenNames";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { ISLAND_BAR_HEIGHT } from "./IslandTopBar";
import { compactCount } from "../Music/CinematicMusic";
import type { InfiniteVideoFeedHandle } from "./InfiniteVideoFeed";

const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

/** Same request, and so the same cache entry, as useLiveStreams. */
const LIVE_UNIT = 200;
const SIDE = 14;
const GRID_SIDE = 14;
const GRID_GAP = 10;
const HAIRLINE = "rgba(255,255,255,0.12)";
const MUTED = "#A1A1AA";
/** Starts under the capsule: web's safe area + 3.75rem. */
const TOP = ISLAND_BAR_HEIGHT + 8;

/** A stream as the page draws it (web's mapApiLiveStreamToLocal). */
interface Stream {
  id: string;
  tokenId?: number;
  streamer: string;
  avatar?: string;
  title: string;
  game: string;
  viewers: string;
  thumbnail: string;
  isLive: boolean;
}

function toStream(row: LiveStreamEntity, index: number, fallbackGame: string): Stream {
  const account = (row as any).account || (row as any).streamer;
  const rawThumb: string | undefined = row.thumbnail || (row as any).thumbnailUrl;
  const thumbnail = rawThumb
    ? rawThumb.startsWith("http") ? rawThumb : buildCdnPath(rawThumb) ?? ""
    : liveThumbnailFor(row as any) ?? "";
  const avatarPath = account?.avatarImageUrl || account?.avatarUrl;
  const categories = (row as any).categories;
  const category = Array.isArray(categories) ? categories[0] : (row as any).category;
  const viewers = row.totalViews ?? row.peakViewers ?? (row as any).viewerCount ?? 0;
  return {
    id: String(row._id || (row as any).streamId || index),
    tokenId: row.tokenId,
    streamer: account?.displayName || account?.username || "",
    avatar: avatarPath ? getAvatarUrl(avatarPath, 62) : undefined,
    title: row.title,
    game: category || fallbackGame,
    viewers: compactCount(Number(viewers) || 0),
    thumbnail,
    isLive: isStreamLive(row),
  };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ src?: string; name: string; style: any }> = ({ src, name, style }) => {
  const [failed, setFailed] = useState(false);
  if (src && src !== "default-avatar" && !failed) {
    return (
      <Image source={{ uri: src }} style={style} contentFit="cover" accessibilityLabel={name} onError={() => setFailed(true)} />
    );
  }
  return (
    <View style={[style, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{name[0]?.toUpperCase() || "?"}</Text>
    </View>
  );
};

const LiveBadge: React.FC<{ style?: any; small?: boolean }> = ({ style, small }) => {
  const { t } = useTranslation();
  return (
    <View style={[styles.liveBadge, style]}>
      <Text style={[styles.liveBadgeText, small && { fontSize: 9 }]}>{t("tv.live")}</Text>
    </View>
  );
};

const SectionTitle: React.FC<{ title: string; meta?: string; onMeta?: () => void }> = ({ title, meta, onMeta }) => (
  <View style={styles.sectionTitle}>
    <Text style={styles.sectionTitleText}>{title}</Text>
    {meta ? (
      onMeta ? (
        <Pressable onPress={onMeta} hitSlop={8} accessibilityRole="button" style={styles.sectionMetaButton}>
          <Text style={styles.sectionMeta}>{meta}</Text>
          <Icon name="ChevronRight" size={16} color={MUTED} />
        </Pressable>
      ) : (
        <Text style={styles.sectionMeta}>{meta}</Text>
      )
    ) : null}
  </View>
);

const GameCover: React.FC<{
  game: LiveGame;
  active: boolean;
  dimmed: boolean;
  onPress: () => void;
}> = ({ game, active, dimmed, onPress }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={game.name}
      accessibilityState={{ selected: active }}
      style={[styles.coverRing, active && styles.coverRingOn, dimmed && { opacity: 0.45 }]}
    >
      <View style={styles.cover}>
        <Image
          source={game.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          accessibilityLabel={game.name}
          onError={() => setFailed(true)}
        />
      </View>
    </Pressable>
  );
};

const StreamTile: React.FC<{ stream: Stream; width: number; onPress: () => void }> = ({ stream, width, onPress }) => {
  const { t } = useTranslation();
  const [thumbFailed, setThumbFailed] = useState(false);
  const hasThumb = !!stream.thumbnail && !thumbFailed;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width }}>
      <View style={styles.tileMedia}>
        {hasThumb ? (
          <Image
            source={{ uri: stream.thumbnail }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <>
            {stream.avatar && stream.avatar !== "default-avatar" ? (
              <Image
                source={{ uri: stream.avatar }}
                style={[StyleSheet.absoluteFill, styles.tileBlur]}
                contentFit="cover"
                blurRadius={24}
              />
            ) : null}
            <View style={styles.tileCenter}>
              <Avatar src={stream.avatar} name={stream.streamer} style={styles.tileAvatar} />
            </View>
          </>
        )}
        {stream.isLive ? <LiveBadge style={styles.tileLive} /> : null}
        <View style={styles.viewers}>
          <Icon name="Eye" size={10} color="#FFFFFF" />
          <Text style={styles.viewersText}>{stream.viewers}</Text>
        </View>
      </View>
      <View style={styles.tileInfo}>
        <Avatar src={stream.avatar} name={stream.streamer} style={styles.tileSmallAvatar} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.tileTitle} numberOfLines={1}>
            {stream.title || t("live.isLiveNow", { name: stream.streamer })}
          </Text>
          <Text style={styles.tileMeta} numberOfLines={1}>
            {stream.streamer} · {stream.game}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const TVCard: React.FC<{ channel: TVChannel; onPress: () => void }> = ({ channel, onPress }) => {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.tvCard}>
      <View style={styles.tvLogo}>
        {channel.logo ? (
          <Image source={{ uri: channel.logo }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
        ) : (
          <Icon name="Tv" size={26} color="#52525B" />
        )}
        <LiveBadge style={styles.tileLive} />
      </View>
      <Text style={styles.tvName} numberOfLines={1}>
        {channel.name}
      </Text>
    </Pressable>
  );
};

/** A sideways row inside the pager: its drags scroll the row, not the tabs. */
const GuardedRow: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const guard = useHorizontalScrollGuard();
  return guard ? <GestureDetector gesture={guard}>{children}</GestureDetector> : children;
};

// ── The tab ─────────────────────────────────────────────────────────────────

export interface CinematicLiveProps {
  active?: boolean;
  scrollHandler?: any;
  onScrollBegin?: () => void;
  onScrollEnd?: () => void;
  onRefresh?: () => void;
  feedRef?: React.MutableRefObject<InfiniteVideoFeedHandle | null>;
}

const CinematicLive: React.FC<CinematicLiveProps> = ({
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
  const tileWidth = Math.floor((width - GRID_SIDE * 2 - GRID_GAP) / 2);
  const listRef = useRef<FlatList<any> | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const game = LIVE_GAMES.find((g) => g.id === gameId) || null;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dehub-live-streams", LIVE_UNIT, "recent"],
    queryFn: () => getLiveVideos({ unit: LIVE_UNIT, sortMode: "recent" }),
    enabled: active,
    refetchInterval: active ? 60_000 : false,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  const { data: tvChannels = [] } = useQuery({
    queryKey: ["tv-channels-preview"],
    queryFn: () => getTVChannelsByCountry("all", 5),
    staleTime: 5 * 60_000,
  });

  const fallbackGame = t("live.justChatting");
  const streams = useMemo<Stream[]>(() => {
    const rows: LiveStreamEntity[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.result)
        ? (data as any).result
        : [];
    return [...rows].sort((a, b) =>
      (Date.parse(b.startedAt || b.createdAt || "") || 0) -
      (Date.parse(a.startedAt || a.createdAt || "") || 0)
    ).map((row, i) => toStream(row, i, fallbackGame));
  }, [data, fallbackGame]);

  // One ring per creator who is on air right now.
  const liveCreators = useMemo(() => {
    const seen = new Set<string>();
    return streams.filter((s) => {
      if (!s.isLive || seen.has(s.streamer)) return false;
      seen.add(s.streamer);
      return true;
    });
  }, [streams]);

  const shown = useMemo(
    () => (game ? streams.filter((s) => streamMatchesGame(s.game, game)) : streams),
    [streams, game],
  );
  const liveCount = streams.filter((s) => s.isLive).length;

  const openStream = useCallback(
    (stream: Stream) =>
      navigation.navigate(ScreenNames.LiveViewer, {
        streamId: stream.id,
        isLive: stream.isLive,
        ...(stream.tokenId != null ? { tokenId: stream.tokenId } : {}),
      }),
    [navigation],
  );
  const openTV = useCallback(() => navigation.navigate(ScreenNames.TV), [navigation]);

  const scrollToTop = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), []);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    onRefresh?.();
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["tv-channels-preview"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, queryClient, refetch]);

  useEffect(() => {
    if (!feedRef) return;
    feedRef.current = {
      scrollToTop,
      scrollToTopAndRefresh: () => {
        scrollToTop();
        void handleRefresh();
      },
    };
    return () => {
      feedRef.current = null;
    };
  }, [feedRef, scrollToTop, handleRefresh]);

  const header = (
    <View style={{ paddingTop: TOP }}>
      {liveCreators.length > 0 ? (
        <GuardedRow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creators}>
            {liveCreators.map((s) => (
              <Pressable key={s.id} onPress={() => openStream(s)} accessibilityRole="button" style={styles.creator}>
                <LinearGradient
                  colors={["#EF4444", "#F97316"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.creatorRing}
                >
                  <Avatar src={s.avatar} name={s.streamer} style={styles.creatorAvatar} />
                  <LiveBadge small style={styles.creatorLive} />
                </LinearGradient>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {s.streamer}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </GuardedRow>
      ) : null}

      <GuardedRow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.games}>
          {LIVE_GAMES.map((g) => (
            <GameCover
              key={g.id}
              game={g}
              active={gameId === g.id}
              dimmed={!!gameId && gameId !== g.id}
              onPress={() => setGameId((cur) => (cur === g.id ? null : g.id))}
            />
          ))}
        </ScrollView>
      </GuardedRow>

      <SectionTitle
        title={game ? game.name : t("settings.notifLiveStreams")}
        meta={game ? t("dpay.showAll") : liveCount > 0 ? t("live.streamCount", { count: liveCount }) : undefined}
        onMeta={game ? () => setGameId(null) : undefined}
      />
    </View>
  );

  const footer = (
    <View>
      <View style={styles.stages}>
        <StagesCarousel />
      </View>
      {tvChannels.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <SectionTitle title={t("tv.title")} meta={t("dpay.showAll")} onMeta={openTV} />
          <GuardedRow>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tvRow}>
              {tvChannels.map((channel) => (
                <TVCard key={channel.id} channel={channel} onPress={openTV} />
              ))}
            </ScrollView>
          </GuardedRow>
        </View>
      ) : null}
    </View>
  );

  const empty = isLoading ? (
    <View style={styles.gridSkeleton}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={{ width: tileWidth }}>
          <View style={[styles.tileMedia, styles.skeleton]} />
          <View style={[styles.skeleton, { marginTop: 6, height: 12, width: "75%", borderRadius: 4 }]} />
        </View>
      ))}
    </View>
  ) : streams.length === 0 ? (
    <View style={styles.emptyState}>
      <Icon name="Radio" size={40} color="#52525B" />
      <Text style={styles.emptyTitle}>{t("live.noLiveStreams")}</Text>
      <Text style={styles.emptyBody}>{isError ? t("live.loadStreamsFailed") : t("live.noOneStreaming")}</Text>
      <Pressable onPress={() => refetch()} accessibilityRole="button" style={styles.emptyButton}>
        <Text style={styles.emptyButtonText}>{t("dao.refresh")}</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.emptyState}>
      <Icon name="Radio" size={32} color="#52525B" />
      <Text style={styles.emptyBody}>{t("live.noOneStreamingGame", { game: game?.name ?? "" })}</Text>
      <Pressable onPress={() => setGameId(null)} accessibilityRole="button" style={styles.glassButton}>
        <ChromeSurface radius={10} tinted />
        <Text style={styles.glassButtonText}>{t("live.seeAllStreams")}</Text>
      </Pressable>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Stream>) => (
      <StreamTile stream={item} width={tileWidth} onPress={() => openStream(item)} />
    ),
    [tileWidth, openStream],
  );

  return (
    <View style={{ flex: 1 }}>
      <AnimatedFlatList
        ref={listRef as any}
        data={isLoading ? [] : shown}
        keyExtractor={(s: Stream) => s.id}
        renderItem={renderItem as any}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
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
      <DeHubRefreshMark refreshing={refreshing} topInset={ISLAND_BAR_HEIGHT} />
    </View>
  );
};

const styles = StyleSheet.create({
  listContent: { paddingBottom: TAB_BAR_CONTENT_INSET + 64 },
  avatarFallback: { backgroundColor: "#3F3F46", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  liveBadge: { backgroundColor: "#EF4444", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  liveBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: GRID_SIDE,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitleText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  sectionMetaButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionMeta: { color: MUTED, fontSize: 13, fontWeight: "500" },
  creators: { gap: 12, paddingHorizontal: SIDE, paddingBottom: 4 },
  creator: { width: 66, alignItems: "center" },
  creatorRing: { width: 62, height: 62, borderRadius: 14, padding: 2 },
  creatorAvatar: { width: "100%", height: "100%", borderRadius: 12, borderWidth: 2, borderColor: "#000000" },
  creatorLive: { position: "absolute", bottom: -7, alignSelf: "center" },
  creatorName: { marginTop: 10, color: "#D4D4D8", fontSize: 11, maxWidth: 66 },
  games: { gap: 10, paddingHorizontal: SIDE, paddingVertical: 8, marginTop: 12 },
  // Web's ring-2 + ring-offset-2: drawn outside the cover, so it takes no
  // room in the row.
  coverRing: { margin: -4, borderRadius: 14, padding: 2, borderWidth: 2, borderColor: "transparent" },
  coverRingOn: { borderColor: "#FFFFFF" },
  cover: { width: 92, aspectRatio: 3 / 4, borderRadius: 10, overflow: "hidden", backgroundColor: "#18181B" },
  gridRow: { paddingHorizontal: GRID_SIDE, gap: GRID_GAP, marginBottom: 14 },
  gridSkeleton: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: GRID_SIDE, gap: GRID_GAP, rowGap: 14 },
  skeleton: { backgroundColor: "rgba(255,255,255,0.05)" },
  tileMedia: { aspectRatio: 16 / 9, borderRadius: 10, overflow: "hidden", backgroundColor: "#18181B" },
  tileBlur: { opacity: 0.6, transform: [{ scale: 1.25 }] },
  tileCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  tileAvatar: { width: 40, height: 40, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" },
  tileLive: { position: "absolute", left: 6, top: 6 },
  viewers: {
    position: "absolute",
    right: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewersText: { color: "#FFFFFF", fontSize: 10 },
  tileInfo: { marginTop: 6, flexDirection: "row", gap: 6 },
  tileSmallAvatar: { width: 22, height: 22, borderRadius: 6 },
  tileTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  tileMeta: { color: MUTED, fontSize: 11 },
  stages: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  tvRow: { gap: 12, paddingHorizontal: SIDE },
  tvCard: { width: 192 },
  tvLogo: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
  },
  tvName: { marginTop: 6, color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  emptyState: { alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 40 },
  emptyTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "600", marginTop: 8 },
  emptyBody: { color: MUTED, fontSize: 14, textAlign: "center" },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  emptyButtonText: { color: "#FFFFFF", fontSize: 14 },
  glassButton: { marginTop: 4, height: 36, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  glassButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});

export default React.memo(CinematicLive);
