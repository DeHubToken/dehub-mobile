import Animated from "react-native-reanimated";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Pressable, Text, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
import FeedCard from "../Home/FeedCard";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import ProfileEmptyState from "./ProfileEmptyState";
import { getImageUrl } from "../../libs/misc";
import { ScreenNames } from "../../navigation/ScreenNames";
import {
  getPublicPlaylists,
  getPublicPlaylistItems,
  type PublicPlaylist,
} from "../../services/bookmark.service";

/**
 * Playlists tab — the profile's public bookmark folders.
 *
 * Same shape as PinnedRoute (address in, list header threaded through) so the
 * two profile surfaces mount it the same way. Two levels: a grid of playlist
 * cards, then one playlist's posts as ordinary feed cards with a back row.
 * The profile only lists this tab while the count is above zero, so the
 * empty state is only ever the owner's — the nudge that fills it.
 */

interface PlaylistsRouteProps {
  address?: string;
  isOwnProfile?: boolean;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
}

const PAGE_SIZE = 20;
const COVER_WIDTH = 220;

const PlaylistsRoute: React.FC<PlaylistsRouteProps> = ({ address, isOwnProfile = false, listRef, onScroll, listHeader, onBeforeNavigate }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const [playlists, setPlaylists] = useState<PublicPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState<PublicPlaylist | null>(null);
  const [items, setItems] = useState<UnifiedFeedItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const endRef = useRef(false);

  const load = useCallback(() => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    getPublicPlaylists(address)
      .then((list) => setPlaylists(list))
      .catch((e: any) => setError(e?.message || t("savedPosts.fetchFoldersFailed")))
      .finally(() => setLoading(false));
  }, [address, t]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchItems = useCallback(async (playlist: PublicPlaylist, cursor: string | null) => {
    if (!address) return;
    const page = await getPublicPlaylistItems(address, playlist.id, { limit: PAGE_SIZE, cursor });
    const mapped: UnifiedFeedItem[] = page.result.map((item: any) => ({
      ...item,
      tokenId: item.tokenId ?? item.post?.tokenId,
    }));
    setItems((prev) => (cursor ? [...prev, ...mapped] : mapped));
    cursorRef.current = page.nextCursor;
    if (!page.hasMore || !page.nextCursor) endRef.current = true;
  }, [address]);

  const openPlaylist = useCallback((playlist: PublicPlaylist) => {
    setOpen(playlist);
    setItems([]);
    setItemsError(null);
    setItemsLoading(true);
    cursorRef.current = null;
    endRef.current = false;
    fetchItems(playlist, null)
      .catch((e: any) => setItemsError(e?.message || t("bookmarks.playlist.unavailable")))
      .finally(() => setItemsLoading(false));
  }, [fetchItems, t]);

  const closePlaylist = useCallback(() => {
    setOpen(null);
    setItems([]);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!open || loadingMore || endRef.current || itemsLoading) return;
    setLoadingMore(true);
    await fetchItems(open, cursorRef.current).catch(() => {});
    setLoadingMore(false);
  }, [open, loadingMore, itemsLoading, fetchItems]);

  const renderPlaylistCard = ({ item }: { item: PublicPlaylist }) => {
    const cover = item.coverImageUrl ? getImageUrl(item.coverImageUrl, COVER_WIDTH) : "";
    return (
      <Pressable
        onPress={() => openPlaylist(item)}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <View style={styles.cover}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <View style={styles.coverFallback}>
              <Icon name="ListVideo" size={28} color="#808089" />
            </View>
          )}
          <View style={styles.countPill}>
            <Text style={styles.countText}>{t("bookmarks.playlist.itemsCount", { count: item.itemCount })}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          {!!item.description && (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
        </View>
      </Pressable>
    );
  };

  // ── One playlist ───────────────────────────────────────────────────────
  if (open) {
    const header = (
      <View>
        {listHeader}
        <View style={styles.backRow}>
          <Pressable
            onPress={closePlaylist}
            hitSlop={8}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t("bookmarks.playlist.back")}
          >
            <Icon name="ChevronLeft" size={22} color="#F9FBFF" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.openTitle} numberOfLines={1}>{open.name}</Text>
            {!!open.description && <Text style={styles.openDesc} numberOfLines={1}>{open.description}</Text>}
          </View>
          <Text style={styles.openCount}>{t("bookmarks.playlist.itemsCount", { count: open.itemCount })}</Text>
        </View>
      </View>
    );

    if (itemsLoading || itemsError || items.length === 0) {
      return (
        <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
          {header}
          {itemsLoading ? (
            <View style={styles.center}><ActivityIndicator color="#fff" /></View>
          ) : (
            <ProfileEmptyState
              kind="playlists"
              title={open.name}
              subtitle={itemsError ? t("bookmarks.playlist.unavailable") : t("bookmarks.playlist.noPosts")}
            />
          )}
        </Animated.ScrollView>
      );
    }

    return (
      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item, idx) => `${item.tokenId ?? idx}`}
        renderItem={({ item }) => <FeedCard item={item} onBeforeNavigate={onBeforeNavigate} />}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={endRef.current ? undefined : handleLoadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null
        }
      />
    );
  }

  // ── Playlist grid ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View style={styles.center}><ActivityIndicator color="#fff" /></View>
      </Animated.ScrollView>
    );
  }

  if (error) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View style={[styles.center, { paddingHorizontal: 24, gap: 12 }]}>
          <Icon name="WifiOff" size={48} color="#808089" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} hitSlop={8} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>
    );
  }

  if (playlists.length === 0) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <ProfileEmptyState
          kind="playlists"
          title={t("profile.tabPlaylists")}
          subtitle={isOwnProfile ? t("bookmarks.playlist.emptyOwnerHint") : t("bookmarks.playlist.emptyVisitor")}
        />
        {isOwnProfile && (
          <View style={{ alignItems: "center", paddingBottom: 24 }}>
            <Pressable
              onPress={() => {
                onBeforeNavigate?.();
                navigation.navigate(ScreenNames.SavedPosts);
              }}
              hitSlop={8}
              style={styles.retryBtn}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>{t("bookmarks.playlist.openBookmarks")}</Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>
    );
  }

  return (
    <Animated.FlatList
      ref={listRef}
      data={playlists}
      keyExtractor={(item) => item.id}
      renderItem={renderPlaylistCard}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={listHeader}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    />
  );
};

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  row: { gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#27272A" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  countPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  countText: { color: "#FFFFFF", fontSize: 11, fontWeight: "500" },
  cardBody: { padding: 10 },
  cardTitle: { color: "#F9FBFF", fontSize: 14, fontWeight: "700" },
  cardDesc: { color: "#A6A9AC", fontSize: 12, marginTop: 2 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  backBtn: { padding: 6, borderRadius: 10 },
  openTitle: { color: "#F9FBFF", fontSize: 16, fontWeight: "700" },
  openDesc: { color: "#8B8D90", fontSize: 12, marginTop: 1 },
  openCount: { color: "#8B8D90", fontSize: 12 },
  errorText: { color: "#A6A9AC", fontSize: 14, textAlign: "center" },
  retryBtn: {
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
});

export default PlaylistsRoute;
