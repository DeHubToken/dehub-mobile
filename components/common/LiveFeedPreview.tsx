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

import React, { memo, useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
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
  const player = useVideoPlayer(url, p => {
    p.muted = true;
    p.loop = false;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });

  useEffect(() => {
    try {
      player.play();
    } catch {
      // The player is released with the view; a play() on a torn-down one
      // throws rather than returning, and there is nothing to recover.
    }
  }, [player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls={false}
      contentFit="cover"
      // A SurfaceView is composited beneath the app window, so the card's
      // rounded-corner clip never reached it on Android.
      surfaceType="textureView"
    />
  );
}

function LiveFeedPreviewComponent({ url, thumbnail, active, label }: Props) {
  const poster = usablePoster(thumbnail);
  return (
    <View style={StyleSheet.absoluteFill}>
      {poster ? (
        <SmartImage
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          recyclingKey={poster}
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
