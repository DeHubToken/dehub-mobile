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
import { View, StyleSheet } from "react-native";
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
    />
  );
}

function LiveFeedPreviewComponent({ url, thumbnail, active }: Props) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {thumbnail ? (
        <SmartImage
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          recyclingKey={thumbnail}
        />
      ) : (
        // The self-hosted ingest renders no thumbnail, so this is the common
        // case, not the rare one. With the player no longer mounted on every
        // card there has to be something behind it, or an inactive live card
        // is a blank grey slab — which is how "broken image" gets reported.
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="Radio" size={32} color="#6F7174" />
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
  },
});

export default memo(LiveFeedPreviewComponent);
