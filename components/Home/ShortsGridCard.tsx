import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Dimensions, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import Icon from "../ui/Icon";
import { getShortsThumbnailUrl, getPreviewUrl, getAvatarUrl, formatCompactNumber } from "../../libs";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 4;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING - GRID_GAP) / 2;
const CARD_HEIGHT = CARD_WIDTH * (16 / 9);
const AUTOPLAY_DELAY = 800;

interface ShortsGridCardProps {
  item: UnifiedFeedItem;
  index: number;
  isVisible?: boolean;
  onPress: (index: number) => void;
}

const ShortsGridCardComponent: React.FC<ShortsGridCardProps> = ({ item, index, isVisible = false, onPress }) => {
  const tokenId = item.tokenId ?? item.id;

  const thumbnailUri = useMemo(() => {
    return getShortsThumbnailUrl(tokenId) || "";
  }, [tokenId]);

  const avatarUri = useMemo(
    () => getAvatarUrl(item.minterUser?.avatarImageUrl || item.minterAvatarUrl),
    [item.minterUser?.avatarImageUrl, item.minterAvatarUrl],
  );

  const previewUrl = useMemo(() => getPreviewUrl(tokenId), [tokenId]);

  const username = item.minterUser?.username || item.minterUsername || "";
  const views = item.views || 0;
  const likes = (item as any).totalVotes?.for || item.likes || 0;

  const [hasStarted, setHasStarted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  const player = useVideoPlayer(previewUrl || null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!player) return;
    const subs: Array<{ remove: () => void }> = [];
    try {
      subs.push(
        player.addListener("statusChange", ({ status }) => {
          if (status === "readyToPlay") setIsReady(true);
        }),
      );
      subs.push(
        player.addListener("playingChange", ({ isPlaying: playing }) => {
          isPlayingRef.current = playing;
        }),
      );
    } catch {}
    return () => { subs.forEach((s) => { try { s.remove(); } catch {} }); };
  }, [player]);

  useEffect(() => {
    if (!player || !previewUrl) return;

    if (!isVisible) {
      if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; }
      if (isPlayingRef.current) { try { player.pause(); } catch {} isPlayingRef.current = false; }
      setHasStarted(false);
      setIsReady(false);
      return;
    }

    if (hasStarted) return;

    autoplayTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current && player) {
        player.muted = true;
        player.play();
        isPlayingRef.current = true;
        setHasStarted(true);
      }
    }, AUTOPLAY_DELAY);

    return () => { if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; } };
  }, [player, previewUrl, isVisible, hasStarted]);

  useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
      try { player?.pause(); } catch {}
    };
  }, [player]);

  const handlePress = useCallback(() => onPress(index), [onPress, index]);

  const showVideo = hasStarted && isReady;

  return (
    <Pressable onPress={handlePress} style={styles.card}>
      {/* Thumbnail base layer — always rendered */}
      {thumbnailUri ? (
        <Image
          source={thumbnailUri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={`short-grid-${tokenId}`}
          transition={150}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="Play" size={32} color="#555" />
        </View>
      )}

      {/* Video preview layer — fades in once ready */}
      {player && previewUrl && (
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, { opacity: showVideo ? 1 : 0 }]}
          contentFit="cover"
          nativeControls={false}
        />
      )}

      {/* Bottom gradient + info overlay */}
      <View style={styles.overlay} pointerEvents="none" />

      <View style={styles.bottomInfo} pointerEvents="none">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Image source={avatarUri} style={styles.avatar} contentFit="cover" />
          <Text numberOfLines={1} style={styles.username}>
            @{username}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Icon name="Eye" size={12} color="#E0E0E0" />
            <Text style={styles.statText}>{formatCompactNumber(views)}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon name="Heart" size={12} color="#E0E0E0" />
            <Text style={styles.statText}>{formatCompactNumber(likes)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const ShortsGridCard = memo(ShortsGridCardComponent, (prev, next) =>
  prev.item.tokenId === next.item.tokenId &&
  prev.item.likes === next.item.likes &&
  prev.item.views === next.item.views &&
  prev.index === next.index &&
  prev.isVisible === next.isVisible,
);

export default ShortsGridCard;
export { CARD_WIDTH, CARD_HEIGHT, GRID_GAP };

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#262626",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  bottomInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 20,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#333",
  },
  username: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  statText: {
    color: "#E0E0E0",
    fontSize: 11,
  },
});
