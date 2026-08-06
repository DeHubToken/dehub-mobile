import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  PanResponder,
  Animated,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { useAudioPlayer } from "expo-audio";
import { getUnifiedFeed, type UnifiedFeedItem } from "../../services/feed.unified.service";
import { getAvatarUrl } from "../../libs";
import type { AttachedSound } from "../../hooks/usePostSound";

const { height: SCREEN_H } = Dimensions.get("window");
const MIN_PCT = 0.55;
const MAX_PCT = 0.92;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (sound: AttachedSound) => void;
  currentSound?: AttachedSound | null;
}

const CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com";

const resolveAudioUrl = (audioUrl?: string | null, tokenId?: string | number): string => {
  if (audioUrl) {
    if (audioUrl.startsWith("http")) return audioUrl;
    return `${CDN_BASE}/${audioUrl.replace(/^\/+/, '')}`;
  }
  return `${CDN_BASE}/feed-audio/${tokenId}-audio.mp3`;
};

const resolveTrackTitle = (item: UnifiedFeedItem): string => {
  if (item.name && item.name.trim()) return item.name.trim();
  if (item.description) return item.description.split("\n")[0].trim() || "Untitled";
  return "Untitled";
};

const SoundPickerSheet: React.FC<Props> = ({ visible, onClose, onSelect, currentSound }) => {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  // Single preview player; each track is attached with replace() rather than
  // creating and unloading a Sound per tap.
  const previewPlayer = useAudioPlayer(null);

  const [heightPct, setHeightPct] = useState(MIN_PCT);
  const heightAnim = useRef(new Animated.Value(MIN_PCT)).current;

  // Reset on open
  useEffect(() => {
    if (visible) {
      setHeightPct(MIN_PCT);
      setSearchText("");
      setResults([]);
      setPage(1);
    }
  }, [visible]);

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: heightPct,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [heightPct, heightAnim]);

  // Draggable handle
  const panY = useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          panY.current = 0;
        },
        onPanResponderMove: (_, g) => {
          panY.current = g.dy;
          const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, heightPct - g.dy / SCREEN_H));
          heightAnim.setValue(pct);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 80 || g.vy > 0.5) {
            onClose();
          } else {
            Animated.spring(heightAnim, {
              toValue: heightPct < (MIN_PCT + MAX_PCT) / 2 ? MIN_PCT : MAX_PCT,
              useNativeDriver: false,
            }).start(({ finished }) => {
              if (finished) setHeightPct(heightPct < (MIN_PCT + MAX_PCT) / 2 ? MIN_PCT : MAX_PCT);
            });
          }
        },
      }),
    [heightPct, heightAnim, onClose],
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  // Fetch audio posts
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getUnifiedFeed({
          postType: "feed-audio",
          sortBy: "likes",
          page: 1,
          limit: 20,
          search: debouncedSearch || undefined,
        });
        if (!cancelled) {
          setResults(res.result || []);
          setHasMore(res.pagination?.hasMore ?? false);
          setPage(1);
        }
      } catch (e) {
        console.error("[SoundPicker] Fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, debouncedSearch]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await getUnifiedFeed({
        postType: "feed-audio",
        sortBy: "likes",
        page: nextPage,
        limit: 20,
        search: debouncedSearch || undefined,
      });
      setResults((prev) => [...prev, ...(res.result || [])]);
      setHasMore(res.pagination?.hasMore ?? false);
      setPage(nextPage);
    } catch (e) {
      console.error("[SoundPicker] Load more error:", e);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, debouncedSearch]);

  // expo-audio has no stop(); pause + rewind is the equivalent.
  const stopPreview = useCallback(() => {
    try {
      previewPlayer.pause();
      void previewPlayer.seekTo(0).catch(() => {});
    } catch {}
  }, [previewPlayer]);

  // Preview playback
  const togglePreview = useCallback(
    async (item: UnifiedFeedItem) => {
      const id = String(item.tokenId ?? "");
      if (playingId === id) {
        stopPreview();
        setPlayingId(null);
        return;
      }
      // Stop whatever was previewing; replace() swaps the source in place.
      stopPreview();
      const audioUrl = resolveAudioUrl(item.audioUrl, item.tokenId);
      try {
        previewPlayer.replace({ uri: audioUrl });
        previewPlayer.play();
        setPlayingId(id);
      } catch (e) {
        console.error("[SoundPicker] Preview error:", e);
        setPlayingId(null);
      }
    },
    [playingId, previewPlayer, stopPreview],
  );

  // Clear the "playing" pill when a preview reaches its end.
  useEffect(() => {
    const sub = previewPlayer.addListener("playbackStatusUpdate", (status) => {
      if (status.isLoaded && status.didJustFinish) {
        setPlayingId(null);
      }
    });
    return () => sub.remove();
  }, [previewPlayer]);

  // Stop preview on close. The player is released by useAudioPlayer.
  useEffect(() => {
    if (!visible) {
      stopPreview();
      setPlayingId(null);
    }
  }, [visible, stopPreview]);

  const handleSelect = useCallback(
    (item: UnifiedFeedItem) => {
      const tokenId = String(item.tokenId ?? "");
      const audioUrl = resolveAudioUrl(item.audioUrl, tokenId);
      stopPreview();
      onSelect({
        url: audioUrl,
        title: resolveTrackTitle(item),
        creator: item.minterDisplayName || item.minterUsername || item.minter || "",
        creatorAvatar: item.minterAvatarUrl ? getAvatarUrl(item.minterAvatarUrl) : undefined,
        tokenId,
        duration: item.audioDuration,
      });
    },
    [onSelect, stopPreview],
  );

  const renderItem = useCallback(
    ({ item }: any) => {
      const id = String(item.tokenId ?? "");
      const isPlaying = playingId === id;
      const isSelected = currentSound?.tokenId === id;
      return (
        <TouchableOpacity
          style={[styles.trackRow, isSelected && styles.trackRowSelected]}
          activeOpacity={0.7}
          onPress={() => togglePreview(item)}
        >
          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => togglePreview(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={16}
              color={isSelected ? "#A1A1AA" : "#fff"}
            />
          </TouchableOpacity>
          <Avatar
            uri={item.minterAvatarUrl ? getAvatarUrl(item.minterAvatarUrl) : undefined}
            name={item.minterDisplayName || item.minterUsername || item.minter}
            size={40}
            style={{ marginRight: 10 }}
          />
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {resolveTrackTitle(item)}
            </Text>
            <Text style={styles.trackCreator} numberOfLines={1}>
              {item.minterDisplayName || item.minterUsername || item.minter || "Unknown"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.selectBtn, isSelected && styles.selectBtnActive]}
            onPress={() => handleSelect(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.selectBtnText, isSelected && styles.selectBtnTextActive]}>
              {isSelected ? "Selected" : "Add"}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [playingId, currentSound, togglePreview, handleSelect],
  );

  if (!visible) return null;

  const sheetHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_H],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Edge-to-edge Android doesn't resize for the keyboard; the padding
          lifts the absolute-bottom sheet so the search stays visible. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      </TouchableOpacity>
      <Animated.View
        style={[styles.sheet, { height: sheetHeight }]}
        {...responder.panHandlers}
      >
        {/* Handle bar */}
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Add Sound</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#6F7174" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search sounds..."
            placeholderTextColor="#6F7174"
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={18} color="#6F7174" />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.tokenId ?? Math.random())}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#A1A1AA" />
            ) : (
              <Text style={styles.emptyText}>
                {debouncedSearch ? "No sounds found" : "No audio posts yet"}
              </Text>
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading && results.length > 0 ? (
              <ActivityIndicator style={{ padding: 16 }} color="#A1A1AA" />
            ) : null
          }
        />
      </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(12,12,14,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  handleBar: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#fff" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1D1F21",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 2,
  },
  trackRowSelected: { backgroundColor: "rgba(255,255,255,0.08)" },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  trackCreator: { fontSize: 12, color: "#A6A9AC", marginTop: 2 },
  selectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  selectBtnActive: { backgroundColor: "#A1A1AA" },
  selectBtnText: { fontSize: 13, fontWeight: "500", color: "#fff" },
  selectBtnTextActive: { color: "#09090B" },
  emptyText: { textAlign: "center", color: "#6F7174", marginTop: 40, fontSize: 14 },
});

export default React.memo(SoundPickerSheet);
