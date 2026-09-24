import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import Icon from "../ui/Icon";
import { getShortsThumbnailUrl, getVideoUrl, getAvatarUrl, formatCompactNumber, buildCdnPath } from "../../libs";
import { cdnImage } from "../../libs/cdnImage";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { resolveViewCount } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";

const GRID_GAP = 4;
const GRID_PADDING = 16;

/**
 * Card size from the live window width, so split-screen and unfolding re-flow
 * the grid instead of keeping the width the app started with.
 */
const useShortsCardSize = () => {
  const { width: screenWidth } = useWindowDimensions();
  const width = (screenWidth - GRID_PADDING - GRID_GAP) / 2;
  return { width, height: width * (16 / 9) };
};
const AUTOPLAY_DELAY = 250;

interface ShortsGridCardProps {
  item: UnifiedFeedItem;
  index: number;
  isVisible?: boolean;
  onPress: (index: number) => void;
  /** Called when the card has no loadable media (broken/missing upload) so the grid can drop it. */
  onUnavailable?: (key: string) => void;
}

/**
 * The autoplaying preview for one visible cell. Mounted only while the cell is
 * in view, so off-screen cells hold no native player at all; unmounting
 * releases the player, which is what used to be done by hand on visibility.
 */
const CellPreview: React.FC<{ previewUrl: string }> = ({ previewUrl }) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // Android can hand the VideoView a surface still holding a frame from another
  // cell's video; stay transparent until THIS source draws its first frame.
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  const player = useVideoPlayer(previewUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });

  useEffect(() => {
    // New player instance = new source; the previous first frame no longer counts.
    setFirstFrameRendered(false);
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
    if (!player || hasStarted) return;
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
  }, [player, hasStarted]);

  useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
      try { player?.pause(); } catch {}
      // Stop expo-video's native time-update clock before release (Android
      // never zeroes it on close).
      try { player.timeUpdateEventInterval = 0; } catch {}
    };
  }, [player]);

  const showVideo = hasStarted && isReady && firstFrameRendered;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { opacity: showVideo ? 1 : 0 }]}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setFirstFrameRendered(true)}
        // TextureView instead of Android's default SurfaceView so the video
        // renders in the view hierarchy and can't punch through / overlap
        // other grid cells while scrolling.
        surfaceType="textureView"
      />
    </View>
  );
};

const ShortsGridCardComponent: React.FC<ShortsGridCardProps> = ({ item, index, isVisible = false, onPress, onUnavailable }) => {
  const tokenId = item.tokenId ?? item.id;
  const mediaKey = String(tokenId);
  const { isMinimal } = useAppTheme();
  const { width: CARD_WIDTH, height: CARD_HEIGHT } = useShortsCardSize();

  // Resolve a raw API path (e.g. "shorts/123.jpg") or full URL to a CDN URL,
  // sized to the card rather than fetched at full resolution — this is a poster
  // behind an autoplaying video, and the video is the thing worth the bytes.
  const resolveCdn = (raw?: string | null): string | undefined =>
    raw
      ? cdnImage(raw.startsWith("http") ? raw : buildCdnPath(raw), { width: CARD_WIDTH })
      : undefined;

  // Prefer the poster/thumbnail returned by the API, fall back to the derived path.
  const thumbnailUri = useMemo(() => {
    return (
      resolveCdn(item.imageUrl || item.thumbnailUrl) ||
      getShortsThumbnailUrl(tokenId, CARD_WIDTH) ||
      ""
    );
  }, [item.imageUrl, item.thumbnailUrl, tokenId, CARD_WIDTH]);

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
  // Signed-out viewers are already folded into totalViews by the API.
  const views = resolveViewCount(item);
  const likes = (item as any).totalVotes?.for || item.likes || 0;

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
  const handlePress = useCallback(() => onPress(index), [onPress, index]);

  // Broken/missing media — render nothing; the grid drops it via onUnavailable.
  if (thumbFailed) return null;

  return (
    // Minimal: the cell behind a loading poster is black, not a grey box.
    <Pressable onPress={handlePress} style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }, isMinimal && styles.minimalCard]}>
      {/* Thumbnail base layer — always rendered */}
      <Image
        source={thumbnailUri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={`short-grid-${tokenId}`}
        cachePolicy="memory-disk"
        transition={150}
        onError={() => setThumbFailed(true)}
      />

      {/* Video preview layer — only the visible cells mount a player at all.
          expo-video builds a native ExoPlayer in the constructor whether or not
          a source is attached, so a player per mounted cell (20+ in this grid)
          was a player object graph per cell regardless of the null source. */}
      {isVisible && previewUrl && <CellPreview previewUrl={previewUrl} />}

      {/* Bottom gradient + info overlay */}
      <View style={styles.overlay} pointerEvents="none" />

      <View style={styles.bottomInfo} pointerEvents="none">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Image
            // getAvatarUrl hands back the "default-avatar" sentinel, which expo-image
            // cannot load, so the creator showed as an empty dot.
            source={avatarUri && avatarUri !== "default-avatar" ? avatarUri : undefined}
            style={[styles.avatar, isMinimal && styles.minimalAvatar]}
            contentFit="cover"
          />
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
  prev.onPress === next.onPress &&
  prev.onUnavailable === next.onUnavailable &&
  prev.item === next.item &&
  prev.item.tokenId === next.item.tokenId &&
  prev.item.likes === next.item.likes &&
  // Compare the same number the card renders. Comparing the raw `views` half
  // meant a card whose totalViews moved (an anon or badge-weighted view) never
  // re-rendered, so the grid held a stale count until something else changed.
  resolveViewCount(prev.item) === resolveViewCount(next.item) &&
  prev.index === next.index &&
  prev.isVisible === next.isVisible,
);

export default ShortsGridCard;
export { useShortsCardSize, GRID_GAP };

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
  },
  minimalCard: { backgroundColor: "#000" },
  minimalAvatar: { backgroundColor: "rgba(255,255,255,0.04)" },
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
    borderRadius: 3,
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
