import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Dimensions, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import Icon from "../ui/Icon";
import { getShortsThumbnailUrl, getVideoUrl, getAvatarUrl, formatCompactNumber, buildCdnPath } from "../../libs";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 4;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING - GRID_GAP) / 2;
const CARD_HEIGHT = CARD_WIDTH * (16 / 9);
const AUTOPLAY_DELAY = 250;

interface ShortsGridCardProps {
  item: UnifiedFeedItem;
  index: number;
  isVisible?: boolean;
  onPress: (index: number) => void;
  /** Called when the card has no loadable media (broken/missing upload) so the grid can drop it. */
  onUnavailable?: (key: string) => void;
}

const ShortsGridCardComponent: React.FC<ShortsGridCardProps> = ({ item, index, isVisible = false, onPress, onUnavailable }) => {
  const tokenId = item.tokenId ?? item.id;
  const mediaKey = String(tokenId);

  // Resolve a raw API path (e.g. "shorts/123.jpg") or full URL to a CDN URL.
  const resolveCdn = (raw?: string | null): string | undefined =>
    raw ? (raw.startsWith("http") ? raw : buildCdnPath(raw)) : undefined;

  // Prefer the poster/thumbnail returned by the API, fall back to the derived path.
  const thumbnailUri = useMemo(() => {
    return resolveCdn(item.imageUrl || item.thumbnailUrl) || getShortsThumbnailUrl(tokenId) || "";
  }, [item.imageUrl, item.thumbnailUrl, tokenId]);

  const avatarUri = useMemo(
    () => getAvatarUrl(item.minterUser?.avatarImageUrl || item.minterAvatarUrl),
    [item.minterUser?.avatarImageUrl, item.minterAvatarUrl],
  );

  // Autoplay the full video like web (ShortsFeed → AutoplayVideo uses videos/{id}.mp4).
  // Only use item.previewUrl if the API actually returns one; the derived
  // previews/{id}.mp4 path does NOT exist on the CDN, so never fall back to it.
  const previewUrl = useMemo(
    () =>
      resolveCdn(item.previewUrl) ||
      resolveCdn(item.videoUrl) ||
      getVideoUrl(tokenId),
    [item.previewUrl, item.videoUrl, tokenId],
  );

  const username = item.minterUser?.username || item.minterUsername || "";
  const views = item.views || 0;
  const likes = (item as any).totalVotes?.for || item.likes || 0;

  const [hasStarted, setHasStarted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // The thumbnail is the always-visible base layer; if it can't load (or there's
  // no poster at all) the cell is just a grey box, so treat the card as broken
  // and let the grid remove it rather than showing a dead short.
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    if (!thumbnailUri) setThumbFailed(true);
  }, [thumbnailUri]);

  useEffect(() => {
    if (thumbFailed) onUnavailable?.(mediaKey);
  }, [thumbFailed, mediaKey, onUnavailable]);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // Only attach the media source while the cell is visible — the 2-column
  // grid keeps 20+ cells mounted, and a live ExoPlayer per cell was causing
  // OutOfMemoryError on Android.
  const player = useVideoPlayer(isVisible && previewUrl ? previewUrl : null, (p) => {
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
      // The cell may have been recycled/removed since this was scheduled, which
      // releases the native player — guard so a released VideoPlayer access
      // ("shared object already released") can't crash the JS thread.
      if (!isPlayingRef.current && player) {
        try {
          player.muted = true;
          player.play();
          isPlayingRef.current = true;
          setHasStarted(true);
        } catch {}
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

  // Broken/missing media — render nothing; the grid drops it via onUnavailable.
  if (thumbFailed) return null;

  return (
    <Pressable onPress={handlePress} style={styles.card}>
      {/* Thumbnail base layer — always rendered */}
      <Image
        source={thumbnailUri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={`short-grid-${tokenId}`}
        transition={150}
        onError={() => setThumbFailed(true)}
      />

      {/* Video preview layer — fades in once ready */}
      {player && previewUrl && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <VideoView
            player={player}
            style={[StyleSheet.absoluteFill, { opacity: showVideo ? 1 : 0 }]}
            contentFit="cover"
            nativeControls={false}
            // TextureView instead of Android's default SurfaceView so the video
            // renders in the view hierarchy and can't punch through / overlap
            // other grid cells while scrolling.
            surfaceType="textureView"
          />
        </View>
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
