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
import { FEED_BUFFER_OPTIONS } from "../../libs/videoBuffering";

interface Props {
  /** HLS ladder for the stream. */
  url: string;
  /** Poster frame, shown behind the video (and alone before it starts). */
  thumbnail?: string;
  /** True only on the card the feed is autoplaying, and only while visible. */
  active: boolean;
}

function LiveFeedPreviewComponent({ url, thumbnail, active }: Props) {
  const player = useVideoPlayer(url, p => {
    p.muted = true;
    p.loop = false;
    p.bufferOptions = FEED_BUFFER_OPTIONS;
  });

  useEffect(() => {
    try {
      if (active) player.play();
      else player.pause();
    } catch {
      // The player is released with the view; a play() on a torn-down one
      // throws rather than returning, and there is nothing to recover.
    }
  }, [active, player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {!!thumbnail && (
        <SmartImage
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          recyclingKey={thumbnail}
        />
      )}
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit="cover"
      />
    </View>
  );
}

export default memo(LiveFeedPreviewComponent);
