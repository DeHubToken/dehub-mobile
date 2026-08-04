/**
 * TVScreen
 * ========
 * Native port of web's TVPage (/app/tv) + LiveTVSection: browse free live
 * channels by country, search by name, tap to watch.
 *
 * Streams are HLS (.m3u8) — the service filters out DRM and embed-only hosts
 * exactly as web does, so everything reaching this screen is playable by
 * expo-video natively. Playback failures auto-report through the same
 * `report-broken-channel` edge function web uses.
 *
 * Web's floating picture-in-picture player is not ported; the player here is a
 * full-screen modal. PiP across a native navigator is a bigger piece of work
 * and is tracked separately.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer, type VideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Icon from "../components/ui/Icon";
import useKeyboard from "../hooks/useKeyboard";
import TVChatPanel from "../components/TV/TVChatPanel";
import { theme } from "../theme";
import { toastError } from "../libs/toast";
import { useTranslation } from "react-i18next";
import {
  getTVChannelsByCountry,
  searchTVChannels,
  getAvailableCountries,
  reportBrokenChannel,
  type TVChannel,
} from "../services/liveTv.service";

const PAGE_LIMIT = 200;
const GRID_GAP = 10;
const H_PADDING = 12;

// ── Player ──────────────────────────────────────────────────────────────────

const ChannelPlayer: React.FC<{ channel: TVChannel | null; onClose: () => void }> = ({
  channel,
  onClose,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  // Edge-to-edge Android ignores adjustResize, so the window does not shrink
  // when the keyboard opens — lift manually on both platforms, same as
  // LiveChatScreen/CommentSection.
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  const player: VideoPlayer = useVideoPlayer(channel?.streamUrl ?? null, (p) => {
    p.loop = false;
    p.play();
  });

  // A dead stream is the normal failure here — surface it and tell the backend,
  // which is how web keeps the verified channel list clean.
  useEffect(() => {
    if (!channel) {
      setFailed(false);
      return;
    }
    const sub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error" || error) {
        setFailed(true);
        void reportBrokenChannel(channel.id);
      }
    });
    return () => sub.remove();
  }, [channel, player]);

  return (
    <Modal
      visible={!!channel}
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View
        style={[
          styles.playerRoot,
          { paddingTop: insets.top, marginBottom: kbVisible ? kbHeight : 0 },
        ]}
      >
        <View style={styles.playerHeader}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
            <Icon name="ChevronDown" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.playerTitle} numberOfLines={1}>
              {channel?.name}
            </Text>
            <Text style={styles.playerCountry} numberOfLines={1}>
              {channel?.country}
            </Text>
          </View>
        </View>

        <View style={[styles.videoWrap, { height: Math.round((width * 9) / 16) }]}>
          {failed ? (
            <View style={styles.videoFallback}>
              <Icon name="TriangleAlert" size={30} color="#F87171" />
              <Text style={styles.playerError}>{t("tv.notBroadcasting")}</Text>
              <Text style={styles.dim}>{t("tv.reportedAutomatically")}</Text>
            </View>
          ) : (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              allowsFullscreen
              nativeControls
            />
          )}
        </View>

        {/* Live chat fills the space under the 16:9 box. Mounted only while a
            channel is open so the realtime subscription follows the modal.
            expo-video's native fullscreen presents its own view controller, so
            this is portrait-only by construction. */}
        {!!channel && (
          <TVChatPanel
            channelId={channel.id}
            enabled={!!channel}
            bottomInset={kbVisible ? 0 : insets.bottom}
          />
        )}
      </View>
    </Modal>
  );
};

// ── Channel card ────────────────────────────────────────────────────────────

const ChannelCard: React.FC<{ channel: TVChannel; width: number; onPress: () => void }> = ({
  channel,
  width,
  onPress,
}) => {
  const { t } = useTranslation();
  return (
  <Pressable style={[styles.card, { width }]} onPress={onPress}>
    <View style={[styles.logoWrap, { height: Math.round(width * 0.62) }]}>
      {channel.logo ? (
        <Image
          source={{ uri: channel.logo }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
        />
      ) : (
        <Icon name="Tv" size={26} color="#3F3F46" />
      )}
      <View style={styles.livePill}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>{t("tv.live")}</Text>
      </View>
    </View>
    <View style={{ padding: 8 }}>
      <Text style={styles.channelName} numberOfLines={1}>
        {channel.name}
      </Text>
      <Text style={styles.channelCountry} numberOfLines={1}>
        {channel.country}
      </Text>
    </View>
  </Pressable>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────

export default function TVScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: screenW } = useWindowDimensions();

  const [country, setCountry] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [playing, setPlaying] = useState<TVChannel | null>(null);

  // Searching hits the whole channel set, so debounce it — unlike the country
  // filter, which is a cheap in-memory partition.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const countries = useQuery({
    queryKey: ["tv-countries"],
    queryFn: getAvailableCountries,
    staleTime: 5 * 60_000,
  });

  const channels = useQuery({
    queryKey: ["tv-channels", country, debounced],
    queryFn: () =>
      debounced.trim()
        ? searchTVChannels(debounced, PAGE_LIMIT)
        : getTVChannelsByCountry(country, PAGE_LIMIT),
    staleTime: 5 * 60_000,
  });

  const cardWidth = (screenW - H_PADDING * 2 - GRID_GAP) / 2;

  const onRefresh = useCallback(() => {
    void countries.refetch();
    void channels.refetch();
  }, [countries, channels]);

  const countryPills = useMemo(() => (countries.data ?? []).slice(0, 40), [countries.data]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("nav.tv")}</Text>
          <Text style={styles.subtitle}>
            {countries.data?.[0]?.count
              ? t("tv.channelCount", { count: countries.data[0].count })
              : t("tv.subtitle")}
          </Text>
        </View>
        <Icon name="Tv" size={22} color={theme.colors.accent} />
      </View>

      <View style={styles.searchWrap}>
        <Icon name="Search" size={15} color="#71717A" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("tv.searchPlaceholder")}
          placeholderTextColor="#52525B"
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Icon name="X" size={15} color="#71717A" />
          </Pressable>
        )}
      </View>

      {!debounced.trim() && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {countryPills.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCountry(c.id)}
              style={[styles.chip, country === c.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, country === c.id && styles.chipTextActive]}>
                {c.label} ({c.count})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {channels.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : channels.isError ? (
        <View style={styles.center}>
          <Icon name="TriangleAlert" size={38} color="#3F3F46" />
          <Text style={styles.dim}>{t("tv.loadFailed")}</Text>
          <Pressable onPress={() => channels.refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={channels.data ?? []}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GAP }}
          renderItem={({ item }) => (
            <ChannelCard channel={item} width={cardWidth} onPress={() => setPlaying(item)} />
          )}
          contentContainerStyle={{
            paddingHorizontal: H_PADDING,
            paddingBottom: insets.bottom + 24,
            gap: GRID_GAP,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={channels.isRefetching}
              onRefresh={onRefresh}
              tintColor={theme.colors.accentForeground}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="Tv" size={38} color="#3F3F46" />
              <Text style={styles.dim}>
                {debounced ? t("tv.noSearchResults") : t("tv.noChannels")}
              </Text>
            </View>
          }
        />
      )}

      <ChannelPlayer channel={playing} onClose={() => setPlaying(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: H_PADDING,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },

  chipRow: { gap: 8, paddingHorizontal: H_PADDING, paddingVertical: 10, alignItems: "center" },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#000000" },

  card: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  logoWrap: {
    width: "100%",
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  livePill: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  liveDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: "#F87171" },
  liveText: { color: "#FFFFFF", fontSize: 8.5, fontWeight: "800" },
  channelName: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "600" },
  channelCountry: { color: "#71717A", fontSize: 10.5, marginTop: 2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  dim: { color: "#71717A", fontSize: 12.5, textAlign: "center" },
  retryBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#27272A",
  },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },

  playerRoot: { flex: 1, backgroundColor: "#000000" },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  playerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  playerCountry: { color: "#71717A", fontSize: 11.5, marginTop: 1 },
  videoWrap: { width: "100%", backgroundColor: "#000000" },
  videoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  playerError: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", textAlign: "center" },
});
