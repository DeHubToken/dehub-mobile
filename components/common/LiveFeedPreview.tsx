/**
 * Live Feed Preview
 * =================
 * The picture a live post shows IN THE FEED. Until this existed the card drew
 * a poster — often none at all, since the self-hosted ingest renders no
 * thumbnail — and the stream itself only appeared after opening the post.
 *
 * Muted, no controls, and mounted only on the card the feed has handed
 * autoplay to: a live post is a video player, and a feed full of them is how
 * this app runs ExoPlayer out of memory.
 */

import React, { memo, useEffect, useState } from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { useEvent } from "expo";
import { useTranslation } from "react-i18next";
import { VideoView, useVideoPlayer } from "expo-video";
import SmartImage from "./SmartImage";
import Icon from "../ui/Icon";
import { FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";

interface Props {
  /** HLS ladder for the stream. */
  url: string;
  /** Poster frame, shown behind the video (and alone before it starts). */
  thumbnail?: string;
  /** True only on the card the feed is autoplaying, and only while visible. */
  active: boolean;
  /** Shown on the placeholder when there is no poster — the stream's title. */
  label?: string;
}

/**
 * A poster this component can actually point an <Image> at.
 *
 * Callers resolve thumbnails through helpers that answer a SENTINEL rather than
 * a URL when a post has no picture ("default-banner"). Handed to expo-image
 * that throws "no scheme was found", the element paints nothing, and the card
 * shows a bare slab — with the placeholder below skipped, because a poster
 * appeared to exist. Anything without a scheme is no poster.
 */
function usablePoster(thumbnail?: string): string | undefined {
  if (!thumbnail) return undefined;
  return /^(https?:|data:|file:|content:|asset:)/i.test(thumbnail.trim())
    ? thumbnail
    : undefined;
}

/**
 * The player itself, split out so it can be mounted conditionally.
 *
 * useVideoPlayer is a hook, so it cannot be skipped inside a component that
 * sometimes needs it — and calling it allocates a native ExoPlayer whether or
 * not the card is the one playing. Keeping it in a child that only exists
 * while `active` is the difference between one player and one per live card.
 */
function LivePlayer({ url }: { url: string }) {
  const { t } = useTranslation();
  const [muted, setMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const player = useVideoPlayer(url, p => {
    p.muted = true;
    p.loop = false;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  useEffect(() => {
    if (!controlsVisible) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, isPlaying, muted]);

  useEffect(() => {
    try {
      player.play();
    } catch {
      // The player is released with the view; a play() on a torn-down one
      // throws rather than returning, and there is nothing to recover.
    }
  }, [player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable accessibilityLabel={t("stages.liveNow")} style={StyleSheet.absoluteFill} onPress={(event) => {
        event.stopPropagation();
        setControlsVisible(value => !value);
      }}>
      <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls={false}
      contentFit="cover"
      // A SurfaceView is composited beneath the app window, so the card's
      // rounded-corner clip never reached it on Android.
      surfaceType="textureView"
      />
      </Pressable>
      {controlsVisible && <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={t(isPlaying ? "audioPost.pause" : "audioPost.play")} style={styles.control} onPress={(event) => {
          event.stopPropagation();
          if (player.playing) player.pause();
          else player.play();
        }}>
          <Icon name={isPlaying ? "Pause" : "Play"} size={18} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={t(muted ? "common.unmute" : "common.mute")} style={styles.control} onPress={(event) => {
          event.stopPropagation();
          player.muted = !muted;
          setMuted(!muted);
        }}>
          <Icon name={muted ? "VolumeX" : "Volume2"} size={18} color="#FFFFFF" />
        </Pressable>
      </View>}
    </View>
  );
}

function LiveFeedPreviewComponent({ url, thumbnail, active, label }: Props) {
  const poster = usablePoster(thumbnail);
  const [failedPoster, setFailedPoster] = useState<string | undefined>();
  return (
    <View style={StyleSheet.absoluteFill}>
      {poster && poster !== failedPoster ? (
        <SmartImage
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          recyclingKey={poster}
          onError={() => setFailedPoster(poster)}
        />
      ) : (
        // The self-hosted ingest renders no thumbnail, so this is the common
        // case, not the rare one. With the player no longer mounted on every
        // card there has to be something behind it, or an inactive live card
        // is a blank grey slab — which is how "broken image" gets reported.
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="Radio" size={32} color="#6F7174" />
          {!!label && (
            <Text numberOfLines={2} style={styles.label}>
              {label}
            </Text>
          )}
        </View>
      )}
      {/* Only the autoplaying card holds a player. Pausing was not enough: a
          paused ExoPlayer is still allocated, still holds its buffers, and a
          feed of live posts mounted one per card — which is the shape that
          produced the OutOfMemoryError in ExoPlayerImplInternal. The poster
          below stays put, so an inactive card still shows the stream's frame. */}
      {active && <LivePlayer url={url} />}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  control: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  label: {
    color: "#8B8D90",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
});

export default memo(LiveFeedPreviewComponent);
