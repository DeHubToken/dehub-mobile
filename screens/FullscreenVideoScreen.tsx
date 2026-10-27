import { MediaControlIcon } from '../components/common/MediaControlGlyph';
import { VIDEO_CONTROL_STRIP_HEIGHT } from '../components/Home/VideoScrubZone';
import { useTranslation as _useCopy } from 'react-i18next';
import { useVideoDownload } from "../context/VideoDownloadContext";
import { PersistentVideoView } from '../components/common/PersistentVideoView';
import { isPictureInPicturePlayer, canStartVideo } from '../libs/pictureInPicture';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useBackPress } from "../hooks/useBackPress";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { VideoView } from "expo-video";
import { usePostVideoPlayer } from "../hooks/usePostVideoPlayer";
import { hasHlsFailed, markHlsFailed, useHlsFallback } from "../libs/hls-fallback";
import PictureInPictureButton from "../components/common/PictureInPictureButton";
import { FULLSCREEN_BUFFER_OPTIONS } from "../libs/videoBuffering";
import {
  configureForBackgroundPlayback,
  releaseBackgroundPlayback,
} from "../libs/audioSession";
import * as ScreenOrientation from "expo-screen-orientation";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Icon from "../components/ui/Icon";
import {
  requestAudioFocus,
  releaseAudioFocus,
} from "../libs/audioFocus";
import {
  requestFeedVideoFocus,
  releaseFeedVideoFocus,
} from "../libs/feedVideoFocus";
import { createViewRecorder } from "../services/view.service";
import { getCachedMuted, setMutedState } from "../libs/videoMutedState";
import { PLAYER_CONSTANTS } from "../components/VideoPlayerCore/utils";
import { isBrainrotSwipe } from "../libs/brainrotFeed";
import { useAppPrefs } from "../hooks/useAppPrefs";
import { ScreenNames } from "../navigation/ScreenNames";
import { getIsLooping, useMediaLooping } from '../libs/video-preferences';
import { toStoryboard } from '../libs/storyboard';
import StoryboardPreview from '../components/VideoPlayerCore/StoryboardPreview';

const DISMISS_THRESHOLD = 150;
const CONTROLS_TIMEOUT = PLAYER_CONSTANTS.HIDE_CONTROLS_DELAY;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const FullscreenVideoScreen = () => {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const downloadVideo = useVideoDownload();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const {
    videoUrl: handedUrl,
    downloadUrl,
    startTime = 0,
    isMuted: initialMuted = false,
    thumbnail,
    tokenId,
    isSignedIn = false,
    creatorUsername,
    downloadTitle,
    storyboard: rawStoryboard,
  } = (route?.params as any) || {};
  const storyboard = useMemo(() => toStoryboard(rawStoryboard), [rawStoryboard]);
  /** The storyboard tile shows while a finger is dragging the timeline. */
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  // The feed hands over its own source, the HLS ladder when the post has one,
  // so the player carries straight over. downloadUrl is the MP4: what the
  // download saves, and what plays here if the ladder fails.
  const videoUrl: string | undefined = useHlsFallback(() =>
    downloadUrl && hasHlsFailed(handedUrl) ? downloadUrl : handedUrl);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(() => getCachedMuted());
  const [currentTime, setCurrentTime] = useState(startTime);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  const isPlayingRef = useRef(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTrackWidthRef = useRef(0);

  const viewRecorderRef = useRef(
    tokenId != null
      ? createViewRecorder({ tokenId, isSignedIn })
      : null
  );

  // Re-arm on unmount so reopening this video counts as another view. The
  // recorder guards a WATCH, not the post — see resetRecordedView.
  useEffect(() => () => viewRecorderRef.current?.reset(), []);

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isDismissing = useRef(false);
  const isInPiPRef = useRef(false);
  const videoViewRef = useRef<VideoView>(null);

  // Set up audio mode for background play/PiP.
  // Routed through libs/audioSession so this screen is not a fourth place
  // writing the global category by hand — and so it stops passing
  // `interruptionModeAndroid`, which expo-audio deprecated in favour of
  // `interruptionMode` working on both platforms.
  useEffect(() => {
    configureForBackgroundPlayback().catch((error) => {
      console.warn('[FullscreenVideoScreen] configureForBackgroundPlayback failed:', error);
    });

    return () => {
      releaseBackgroundPlayback().catch(() => {});
    };
  }, []);

  const { width: screenW, height: screenH } = Dimensions.get("window");

  const { player, session, ownsPlayer, active: ownsVideo } = usePostVideoPlayer(videoUrl || null, (p) => {
    p.loop = getIsLooping();
    p.muted = getCachedMuted();
    p.timeUpdateEventInterval = 0.5;
    if (startTime > 0) p.currentTime = startTime;
    // The audio mode above already allows background playback, but that only
    // grants permission — the player still opts in per instance, and without
    // this it pauses the moment the app is backgrounded regardless.
    p.staysActiveInBackground = true;
    // Lock-screen artwork and transport controls. Background audio with no way
    // to pause it without reopening the app is half a feature; this is the
    // other half. iOS only surfaces it while the session is doNotMix or auto,
    // which is what the effect above sets.
    p.showNowPlayingNotification = true;
    p.bufferOptions = FULLSCREEN_BUFFER_OPTIONS;
  });

  // The player may come from a feed card that pauses in the background.
  useEffect(() => {
    if (!ownsVideo) return;
    player.staysActiveInBackground = true;
    player.showNowPlayingNotification = true;
  }, [player, ownsVideo]);

  const isLooping = useMediaLooping();
  useEffect(() => {
    if (ownsVideo) player.loop = isLooping;
  }, [player, ownsVideo, isLooping]);

  useLayoutEffect(() => {
    if (!ownsVideo) return;
    isPlayingRef.current = player.playing;
    setIsPlaying(player.playing);
    setIsMuted(player.muted);
    setCurrentTime(player.currentTime);
    setVideoDuration(player.duration);
  }, [ownsVideo, player]);

  const stopPlayback = useCallback(() => {
    if (ownsPlayer() && !isPictureInPicturePlayer(player)) { try { player.pause(); } catch {} }
  }, [player, ownsPlayer]);

  useEffect(() => {
    if (!player || !ownsVideo || !canStartVideo(player)) return;
    requestFeedVideoFocus(stopPlayback);
    if (!player.muted) requestAudioFocus(stopPlayback);
    if (!session.userPaused) player.play();

    return () => {
      releaseFeedVideoFocus(stopPlayback);
      releaseAudioFocus(stopPlayback);
    };
  }, [player, ownsVideo, session, stopPlayback]);

  useEffect(() => {
    if (!player) return;
    const subs: Array<{ remove: () => void }> = [];
    try {
      subs.push(player.addListener("playingChange", ({ isPlaying: p }) => {
        if (!ownsPlayer()) return;
        isPlayingRef.current = p;
        setIsPlaying(p);
      }));
    } catch {}
    try {
      subs.push(player.addListener("statusChange", ({ status }) => {
        if (!ownsPlayer()) return;
        setIsBuffering(status === "loading");
        if (status === "readyToPlay" && player.duration > 0) setVideoDuration(player.duration);
        // Nothing here retries, so a ladder that errors is retired at once and
        // the MP4 gets a fresh player (and the card behind follows it).
        if (status === "error") markHlsFailed(videoUrl);
      }));
    } catch {}
    try {
      subs.push(player.addListener("timeUpdate", ({ currentTime: ct }: any) => {
        if (!ownsPlayer()) return;
        setCurrentTime(ct ?? 0);
        if (ct != null && viewRecorderRef.current) {
          viewRecorderRef.current.onProgress(
            ct * 1000,
            player.duration > 0 ? player.duration * 1000 : undefined
          );
        }
      }));
    } catch {}
    return () => { subs.forEach((s) => { try { s.remove(); } catch {} }); };
  }, [player, ownsPlayer, videoUrl]);

  useEffect(() => {
    StatusBar.setHidden(true);
    return () => {
      StatusBar.setHidden(false);
      // The orientation lock is process-wide and outlives this screen. The
      // interactive back gesture pops without closeScreen, which used to leave
      // the whole app in landscape.
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const closeScreen = useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    StatusBar.setHidden(false);
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  useBackPress(closeScreen);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), CONTROLS_TIMEOUT);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [resetControlsTimer]);

  const handleScreenTap = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) resetControlsTimer();
      return next;
    });
  }, [resetControlsTimer]);

  const handleTogglePlay = useCallback(() => {
    if (!player) return;
    if (isPlayingRef.current) {
      session.userPaused = true;
      player.pause();
    } else {
      session.userPaused = false;
      player.play();
    }
    resetControlsTimer();
  }, [player, resetControlsTimer]);

  const handleToggleMute = useCallback(() => {
    if (!player) return;
    const newMuted = !isMuted;
    player.muted = newMuted;
    setIsMuted(newMuted);
    setMutedState(newMuted);
    if (!newMuted) requestAudioFocus(stopPlayback);
    else releaseAudioFocus(stopPlayback);
    resetControlsTimer();
  }, [player, isMuted, resetControlsTimer, stopPlayback]);

  const handleToggleRotation = useCallback(async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
        setIsLandscape(true);
      }
    } catch {}
    resetControlsTimer();
  }, [isLandscape, resetControlsTimer]);

  const handleSeek = useCallback(
    (locationX: number) => {
      if (!player || videoDuration <= 0 || progressTrackWidthRef.current <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationX / progressTrackWidthRef.current));
      const newTime = ratio * videoDuration;
      player.currentTime = newTime;
      setCurrentTime(newTime);
      resetControlsTimer();
    },
    [player, videoDuration, resetControlsTimer]
  );

  const progressPercent = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  // Swiping UP is "scroll down" — on to the next video, as in every
  // short-video app: this one closes into the brainrot shorts feed
  // (libs/brainrotFeed). Replaced rather than pushed, so Back from the shorts
  // lands where the video was opened from. Off for anyone who hid Shorts.
  const shortsEnabled = useAppPrefs().shorts;
  const openShorts = useCallback(() => {
    try { player?.pause(); } catch {}
    navigation.replace(ScreenNames.ShortsViewer, {
      feedParams: { brainrot: true, fromId: tokenId },
    });
  }, [player, navigation, tokenId]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(shortsEnabled ? [-15, 15] : 15)
    .failOffsetX([-10, 10])
    .enabled(!isLandscape)
    .onUpdate((e) => {
      if (isDismissing.current) return;
      if (e.translationY < 0) {
        // Follows the finger up with some resistance, as a hint of what's next.
        translateY.value = shortsEnabled ? e.translationY * 0.35 : 0;
        return;
      }
      const dy = e.translationY;
      translateY.value = dy;
      opacity.value = interpolate(dy, [0, DISMISS_THRESHOLD * 2], [1, 0.3], Extrapolation.CLAMP);
    })
    .onEnd((e) => {
      if (isDismissing.current) return;
      if (shortsEnabled && isBrainrotSwipe(e.translationY, e.velocityY)) {
        isDismissing.current = true;
        translateY.value = withTiming(-screenH, { duration: 200 }, () => {
          runOnJS(openShorts)();
        });
        return;
      }
      if (e.translationY > DISMISS_THRESHOLD) {
        isDismissing.current = true;
        translateY.value = withTiming(screenH, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(closeScreen)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1);
      }
    });

  // Drag-to-scrub on the progress track. The track lives in the controls
  // overlay, outside the swipe-to-dismiss detector, so the two never compete;
  // failOffsetY lets a vertical swipe that starts on the track fall through.
  const scrubGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-15, 15])
    .onStart((e) => {
      runOnJS(setIsScrubbing)(true);
      runOnJS(handleSeek)(e.x);
    })
    .onUpdate((e) => {
      runOnJS(handleSeek)(e.x);
    })
    .onFinalize(() => {
      runOnJS(setIsScrubbing)(false);
    });

  const animContainer = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animBg = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, animBg]} />

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1 }, animContainer]}>
          <Pressable onPress={handleScreenTap} style={styles.videoWrap}>
            {player && (
              <PersistentVideoView
                ref={videoViewRef}
                player={player}
                contentFit="contain"
                nativeControls={false}
                allowsPictureInPicture={true}
                // Leaving the app mid-video pops the player out into a floating
                // window instead of stopping it. allowsPictureInPicture alone
                // only permits PiP, it never enters it — which is why PiP has
                // been technically enabled here and invisible in practice.
                // Android 12+ and iOS; a no-op everywhere else.
                startsPictureInPictureAutomatically={isPlaying}
                onPictureInPictureStart={() => {
                  isInPiPRef.current = true;
                }}
                onPictureInPictureStop={() => {
                  isInPiPRef.current = false;
                }}
                style={{ width: "100%", height: "100%" }}
              />
            )}
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {showControls && <View style={styles.topClose} pointerEvents="box-none">
        <Pressable onPress={closeScreen} style={styles.plainButton} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={t('player.closeVideo')}>
          <MediaControlIcon name="X" />
        </Pressable>
      </View>}
      <View style={styles.splitStrip}>
        <GestureDetector gesture={scrubGesture}>
          <Animated.View style={styles.bottomSeek}>
            <Pressable style={styles.progressTrackPress}
              onPress={event => handleSeek(event.nativeEvent.locationX)}
              onLayout={event => {
                progressTrackWidthRef.current = event.nativeEvent.layout.width;
                setTrackWidth(event.nativeEvent.layout.width);
              }}
              accessibilityRole="adjustable" accessibilityLabel={t('player.videoProgress', { percent: Math.round(progressPercent) })}
              accessibilityHint={t('player.tapToSeek')}>
              <View style={styles.bottomLine}><View style={[styles.progressFill, { width: `${progressPercent}%` }]} /></View>
            </Pressable>
          </Animated.View>
        </GestureDetector>
        <View style={styles.splitRow}>
          <View style={styles.splitGroup}>
            <Pressable onPress={handleTogglePlay} style={styles.plainButton}
              accessibilityRole="button" accessibilityLabel={t(isPlaying ? 'audioPost.pause' : 'audioPost.play')}>
              <MediaControlIcon name={isPlaying ? 'Pause' : 'Play'} plain />
            </Pressable>
            <Pressable onPress={handleToggleMute} style={styles.plainButton}
              accessibilityRole="button" accessibilityLabel={t(isMuted ? 'common.unmute' : 'common.mute')}>
              <MediaControlIcon name={isMuted ? 'VolumeX' : 'Volume2'} plain />
            </Pressable>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
          </View>
          <View style={styles.splitGroup}>
            <PictureInPictureButton videoRef={videoViewRef} plain />
            {!!(downloadUrl ?? videoUrl) && <Pressable style={styles.plainButton} accessibilityRole="button"
              accessibilityLabel={t('postOptions.download')}
              onPress={() => { player.pause(); void downloadVideo({ url: downloadUrl ?? videoUrl, title: downloadTitle || 'video', username: creatorUsername }); }}>
              <MediaControlIcon name="Download" plain />
            </Pressable>}
            <Pressable onPress={handleToggleRotation} style={styles.plainButton}
              accessibilityRole="button" accessibilityLabel={t('player.rotateOrientation')}>
              <MediaControlIcon name={isLandscape ? 'Minimize' : 'Maximize'} plain />
            </Pressable>
          </View>
        </View>
      </View>

      {/* A sibling of the strip rather than its child, so Android cannot clip it. */}
      <StoryboardPreview
        storyboard={storyboard}
        fraction={videoDuration > 0 ? currentTime / videoDuration : 0}
        duration={videoDuration}
        trackWidth={trackWidth}
        visible={isScrubbing}
        bottom={VIDEO_CONTROL_STRIP_HEIGHT + 8}
      />

      {isBuffering && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  videoWrap: {
    flex: 1,
    marginBottom: VIDEO_CONTROL_STRIP_HEIGHT,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  splitStrip: { position: 'absolute', left: 0, right: 0, bottom: 0, height: VIDEO_CONTROL_STRIP_HEIGHT, backgroundColor: '#000' },
  splitRow: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  splitGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  plainButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topClose: { position: 'absolute', left: 12, top: 12 },
  bottomSeek: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24 },
  bottomLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#444' },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  topButtonGroup: {
    flexDirection: "row",
    gap: 8,
  },
  glassButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  glassPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1D1F21",
  },
  centerControls: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    paddingBottom: 4,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    minWidth: 36,
    textAlign: "center",
  },
  progressTrack: {
    flex: 1,
    height: 32,
    justifyContent: "center",
  },
  progressTrackPress: {
    height: 32,
    justifyContent: "center",
  },
  progressTrackInner: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    overflow: "visible",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F4F4F5",
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F4F4F5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default FullscreenVideoScreen;
