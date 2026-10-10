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

import React, { memo, useContext, useEffect, useMemo, useState } from "react";
import { useFeedPlaybackAllowed, useCallInProgress, visualActivity } from "../../libs/visualActivity";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { useEvent } from "expo";
import { useTranslation } from "react-i18next";
import { VideoView } from "expo-video";
import { NavigationContext } from "@react-navigation/native";
import { DeHubLoader } from "../DeHubLoader";
import SmartImage from "./SmartImage";
import Icon from "../ui/Icon";
import { sharedLivePlayerHolders, useSharedLivePlayer } from "../../libs/sharedLivePlayer";
import { useSettledAutoplay } from "../../hooks/useSettledAutoplay";
import { useFeedBleed, useMediaTools, type MediaTool } from "../Home/feedBleed";

interface Props {
  /** HLS ladder for the stream. */
  url: string;
  /** Poster frame, shown behind the video (and alone before it starts). */
  thumbnail?: string;
  /** True only on the card the feed is autoplaying, and only while visible. */
  active: boolean;
  /** Shown on the placeholder when there is no poster — the stream's title. */
  label?: string;
  /** Opens the live viewer. A tap on the picture is a tap on the post. */
  onPress?: () => void;
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
function LivePlayer({ url, onPress }: { url: string; onPress?: () => void }) {
  const [firstFrame, setFirstFrame] = useState(false);
  const { t } = useTranslation();
  const [muted, setMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Shared with the live viewer: opening the post takes this same player
  // over, so the stream carries on instead of reconnecting from a spinner.
  const player = useSharedLivePlayer(url)!;
  const focused = useScreenFocused();
  const playbackAllowed = useFeedPlaybackAllowed();
  const callInProgress = useCallInProgress();
  useEffect(() => {
    const sync = () => {
      if (visualActivity.isCallBusy() || (!visualActivity.isFeedPlaybackAllowed() && sharedLivePlayerHolders(url) <= 1)) {
        try { player.pause(); } catch {}
      }
    };
    const subscription = player.addListener("playingChange", sync);
    sync();
    return () => subscription.remove();
  }, [player, playbackAllowed, callInProgress, url]);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  // Cinematic feed: play and sound live in the card's tools menu, not over
  // the picture.
  const foldTools = !!useFeedBleed()?.setTools;
  const tools = useMemo<MediaTool[] | null>(() => foldTools ? [
    {
      key: "play",
      icon: isPlaying ? "Pause" : "Play",
      label: t(isPlaying ? "audioPost.pause" : "audioPost.play"),
      onPress: () => { if (player.playing) player.pause(); else if (visualActivity.isFeedPlaybackAllowed()) player.play(); },
    },
    {
      key: "sound",
      icon: muted ? "VolumeX" : "Volume2",
      label: t(muted ? "common.unmute" : "common.mute"),
      onPress: () => { player.muted = !muted; setMuted(!muted); },
    },
  ] : null, [foldTools, isPlaying, muted, player, t]);
  useMediaTools(tools);

  useEffect(() => {
    if (!controlsVisible) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, isPlaying, muted]);

  useEffect(() => {
    if (!playbackAllowed) return;
    if (!focused) {
      // Another screen is on top. If it is the live viewer it now owns this
      // player and must be left alone; if nothing else holds it, stop it
      // rather than stream to a screen nobody can see. The wait covers the
      // viewer resolving its stream details before it claims the player;
      // pausing under it would leave it resuming behind the live edge.
      const timer = setTimeout(() => {
        if (sharedLivePlayerHolders(url) <= 1) {
          try { player.pause(); } catch {}
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
    try {
      // Back on the feed: the viewer may have left the player unmuted,
      // backgroundable or paused. The card is always a silent preview.
      player.muted = muted;
      player.staysActiveInBackground = false;
      player.showNowPlayingNotification = false;
      player.play();
    } catch {
      // The player is released with the view; a play() on a torn-down one
      // throws rather than returning, and there is nothing to recover.
    }
    // `muted` is applied by the button itself; re-running on it would replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, focused, url, playbackAllowed]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* A tap opens the live viewer, like a tap anywhere else on the card.
          Swallowing it here to toggle the overlay meant the picture never
          opened the stream. The controls still show for their first few
          seconds and stay tappable on their own. */}
      <Pressable accessibilityRole="button" accessibilityLabel={t("stages.liveNow")} style={StyleSheet.absoluteFill} onPress={(event) => {
        event.stopPropagation();
        if (onPress) onPress();
        else setControlsVisible(value => !value);
      }}>
      {/* Unmounted while another screen is on top: a VideoView that mounts
          takes the player's picture, and the viewer is showing this player.
          Remounting on return is what pulls the picture back to the card. */}
      {focused && <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      onFirstFrameRender={() => setFirstFrame(true)}
      nativeControls={false}
      allowsVideoFrameAnalysis={false}
      contentFit="cover"
      // A SurfaceView is composited beneath the app window, so the card's
      // rounded-corner clip never reached it on Android.
      surfaceType="textureView"
      />}
      </Pressable>
      {status !== 'error' && (!firstFrame || status === 'loading') && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><DeHubLoader size={40} /></View>
      )}
      {controlsVisible && !foldTools && <View style={styles.controls}>
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

/**
 * Whether the screen holding this card is the one in front. A card rendered
 * outside any navigator counts as always in front.
 */
function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

function LiveFeedPreviewComponent({ url, thumbnail, active, label, onPress }: Props) {
  const poster = usablePoster(thumbnail);
  // A viewability tick can hand this slot to a card passing through a fling.
  // Wait before mounting LivePlayer: even a paused native player allocates its
  // decoder and buffers, and doing that at each live row interrupts scrolling.
  const settled = useSettledAutoplay(active, url, 400);
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
      {settled && <LivePlayer key={url} url={url} onPress={onPress} />}
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
