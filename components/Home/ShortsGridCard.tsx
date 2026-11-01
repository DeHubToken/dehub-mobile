import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSilenceOnRelease } from "../../hooks/useSilenceOnRelease";
import { View, Text, Pressable, StyleSheet, useWindowDimensions, PixelRatio } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { shareAudioWhenSilent } from "../../libs/videoAudioMixing";
import { GRID_PREVIEW_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import Icon from "../ui/Icon";
import { getShortsThumbnailUrl, getPlaybackUrl, getAvatarUrl, buildCdnPath, buildFeedImageUrls, getBadgeUrlFor, getBadgeHoverOpticalStyle } from "../../libs/misc";
import { markHlsFailed, useHlsFallback } from "../../libs/hls-fallback";
import Avatar from "../common/Avatar";
import BadgeArtwork from "../common/BadgeArtwork";
import { formatCompactNumber } from "../../libs/numbers.util";
import { cdnImage } from "../../libs/cdnImage";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { resolveViewCount } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import { useSettledAutoplay } from "../../hooks/useSettledAutoplay";
import { isLowEndDevice, maxImageDensity } from "../../libs/deviceTier";

// Old and low-memory phones show the poster only: a looping preview per grid
// cell is an ExoPlayer plus a decoder the phone cannot spare while scrolling.
const LOW_END = isLowEndDevice();

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

/**
 * Width to fetch a grid poster at, in points. Capped at 2x pixels: a 3x phone
 * otherwise fetches a 640px-wide poster per tile, and every new tile's bitmap
 * is copied to the GPU on the frame it scrolls in. Traced on a Galaxy S24+,
 * those copies were 171 of the 191 slow frames scrolling Shorts. A 2x poster
 * is roughly half the bytes and still sharp at tile size.
 */
export function gridPosterWidth(cardWidth: number): number {
  return cardWidth * Math.min(1, maxImageDensity() / PixelRatio.get());
}

/** The poster a grid tile shows; also used to fetch posters ahead of the scroll. */
export function shortsPosterUri(item: UnifiedFeedItem, cardWidth: number): string {
  const tokenId = item.tokenId ?? item.id;
  const widthPt = gridPosterWidth(cardWidth);
  // Photo files live under feed-images/{filename}; the API path 403s.
  if (item.postType === "feed-images") return buildFeedImageUrls(item.imageUrls?.length ? item.imageUrls : [item.imageUrl || ""], widthPt)[0] || "";
  const raw = item.imageUrls?.[0] || item.imageUrl || item.thumbnailUrl;
  return (
    (raw ? cdnImage(raw.startsWith("http") ? raw : buildCdnPath(raw), { width: widthPt }) : undefined) ||
    getShortsThumbnailUrl(tokenId, widthPt) ||
    ""
  );
}

interface ShortsGridCardProps {
  item: UnifiedFeedItem;
  index: number;
  isVisible?: boolean;
  onPress: (index: number) => void;
  /** Called when the card has no loadable media (broken/missing upload) so the grid can drop it. */
  onUnavailable?: (key: string) => void;
  /** Fixed card width (a carousel tile); defaults to the two-column grid size. */
  width?: number;
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
    shareAudioWhenSilent(p);
    p.loop = true;
    p.muted = true;
    p.bufferOptions = GRID_PREVIEW_BUFFER_OPTIONS;
  });
  useSilenceOnRelease(player);

  useEffect(() => {
    // New player instance = new source; the previous first frame no longer counts.
    setFirstFrameRendered(false);
    if (!player) return;
    const subs: Array<{ remove: () => void }> = [];
    try {
      subs.push(
        player.addListener("statusChange", ({ status }) => {
          if (status === "readyToPlay") setIsReady(true);
          // A ladder that will not load is retired; the cell remounts on the MP4.
          if (status === "error") markHlsFailed(previewUrl);
        }),
      );
      subs.push(
        player.addListener("playingChange", ({ isPlaying: playing }) => {
          isPlayingRef.current = playing;
        }),
      );
    } catch {}
    return () => { subs.forEach((s) => { try { s.remove(); } catch {} }); };
  }, [player, previewUrl]);

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
        allowsVideoFrameAnalysis={false}
        onFirstFrameRender={() => setFirstFrameRendered(true)}
        // TextureView instead of Android's default SurfaceView so the video
        // renders in the view hierarchy and can't punch through / overlap
        // other grid cells while scrolling.
        surfaceType="textureView"
      />
    </View>
  );
};

const ShortsGridCardComponent: React.FC<ShortsGridCardProps> = ({ item, index, isVisible = false, onPress, onUnavailable, width }) => {
  const tokenId = item.tokenId ?? item.id;
  const mediaKey = String(tokenId);
  const { isMinimal } = useAppTheme();
  const gridSize = useShortsCardSize();
  const CARD_WIDTH = width ?? gridSize.width;
  const CARD_HEIGHT = width ? width * (16 / 9) : gridSize.height;

  // Sized to the card rather than fetched at full resolution: this is a
  // poster behind an autoplaying video, and the video is worth the bytes.
  const thumbnailUri = useMemo(
    () => shortsPosterUri(item, CARD_WIDTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.postType, item.imageUrls, item.imageUrl, item.thumbnailUrl, tokenId, CARD_WIDTH],
  );

  const avatarUri = useMemo(
    () => getAvatarUrl(item.minterUser?.avatarImageUrl || item.minterAvatarUrl),
    [item.minterUser?.avatarImageUrl, item.minterAvatarUrl],
  );

  // Autoplay (only the one cell the grid picks) the full video like web (ShortsFeed → AutoplayVideo uses videos/{id}.mp4).
  // Only use item.previewUrl if the API actually returns one; the derived
  // previews/{id}.mp4 path does NOT exist on the CDN, so never fall back to it.
  // Otherwise the post's own playback source, the HLS ladder when it has one.
  // Never resolveCdn: that is the image transform, which cannot serve a video.
  const playbackUrl = useHlsFallback(() => getPlaybackUrl({ tokenId, hlsUrl: item.hlsUrl }));
  const previewUrl = useMemo(() => {
    if (item.postType === "feed-images") return undefined;
    const clip = item.previewUrl;
    if (clip) return clip.startsWith("http") ? clip : buildCdnPath(clip);
    return playbackUrl;
  }, [item.postType, item.previewUrl, playbackUrl]);
  const previewSettled = useSettledAutoplay(isVisible, previewUrl, 400);

  const username = item.minterUser?.username || item.minterUsername || "";
  const displayName = item.minterUser?.displayName || item.minterDisplayName || username;
  const badgeImage = item.minterUser?.hideBadgeAndBalance ? null : getBadgeUrlFor(item.minterUser || item);
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

      {/* Video preview layer — only the cell the grid picked mounts a player.
          expo-video builds a native ExoPlayer in the constructor whether or not
          a source is attached, so a player per mounted cell (20+ in this grid)
          was a player object graph per cell regardless of the null source. */}
      {previewSettled && previewUrl && !LOW_END && <CellPreview previewUrl={previewUrl} />}


      {/* Bottom gradient + info overlay */}
      <View style={styles.overlay} pointerEvents="none" />

      {width != null && (
        <View style={styles.topInfo} pointerEvents="none">
          <Avatar uri={avatarUri} size={20} name={displayName} />
          <Text style={[styles.username, { flexShrink: 1 }]} numberOfLines={1}>{displayName}</Text>
          {badgeImage ? (
            <BadgeArtwork source={badgeImage} style={getBadgeHoverOpticalStyle(badgeImage, 10, 0, 11)} contentFit="contain" />
          ) : null}
        </View>
      )}

      <View style={styles.bottomInfo} pointerEvents="none">
        <View style={styles.metadataRow}>
          {width == null && (
          <Image
            // getAvatarUrl hands back the "default-avatar" sentinel, which expo-image
            // cannot load, so the creator showed as an empty dot.
            source={avatarUri && avatarUri !== "default-avatar" ? avatarUri : undefined}
            style={[styles.avatar, isMinimal && styles.minimalAvatar]}
            contentFit="cover"
          />
          )}
          <View style={styles.creatorInfo}>
            {width == null && <Text style={styles.username}>@{username}</Text>}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Icon name="Eye" size={9} strokeWidth={1.6} color="#EDEDED" />
                <Text style={styles.statText}>{formatCompactNumber(views)}</Text>
              </View>
              <View style={styles.stat}>
                <Icon name="ThumbsUp" size={9} strokeWidth={1.6} color="#EDEDED" />
                <Text style={styles.statText}>{formatCompactNumber(likes)}</Text>
              </View>
            </View>
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
  prev.width === next.width &&
  prev.isVisible === next.isVisible,
);

export default ShortsGridCard;
export { useShortsCardSize, GRID_GAP };

const styles = StyleSheet.create({
  card: {
    aspectRatio: 9 / 16,
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
    paddingBottom: 6,
    paddingTop: 20,
  },
  topInfo: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
    padding: 3,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    columnGap: 4,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: "#333",
  },
  creatorInfo: {
    flex: 1,
    minWidth: 0,
    minHeight: 24,
    justifyContent: "space-between",
    rowGap: 4,
  },
  username: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 11,
    fontWeight: "500",
    letterSpacing: -0.1,
    includeFontPadding: false,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 2,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 2,
  },
  statText: {
    color: "#EDEDED",
    fontSize: 9,
    lineHeight: 10,
    includeFontPadding: false,
  },
});
