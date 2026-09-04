import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  StatusBar,
  BackHandler,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";
import { FULLSCREEN_BUFFER_OPTIONS } from "../libs/videoBuffering";
import {
  configureForBackgroundPlayback,
  releaseBackgroundPlayback,
} from "../libs/audioSession";
import { BlurView } from "expo-blur";
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

const DISMISS_THRESHOLD = 150;
const CONTROLS_TIMEOUT = PLAYER_CONSTANTS.HIDE_CONTROLS_DELAY;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const FullscreenVideoScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const {
    videoUrl,
    startTime = 0,
    isMuted: initialMuted = false,
    thumbnail,
    tokenId,
    isSignedIn = false,
  } = (route?.params as any) || {};

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

  // Prevent screen close during Picture-in-Picture
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (isInPiPRef.current) {
        e.preventDefault();
        return;
      }
    });
    return unsubscribe;
  }, [navigation]);

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

  const player = useVideoPlayer(videoUrl || null, (p) => {
    p.loop = true;
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

  useEffect(() => {
    if (!player) return;
    requestFeedVideoFocus(() => { try { player.pause(); } catch {} });
    if (!initialMuted) requestAudioFocus(() => { try { player.pause(); } catch {} });
    player.play();

    return () => {
      try { player.pause(); } catch {}
      releaseFeedVideoFocus(() => {});
      releaseAudioFocus(() => {});
    };
  }, [player, initialMuted]);

  useEffect(() => {
    if (!player) return;
    const subs: Array<{ remove: () => void }> = [];
    try {
      subs.push(player.addListener("playingChange", ({ isPlaying: p }) => {
        isPlayingRef.current = p;
        setIsPlaying(p);
      }));
    } catch {}
    try {
      subs.push(player.addListener("statusChange", ({ status }) => {
        setIsBuffering(status === "loading");
        if (status === "readyToPlay" && player.duration > 0) setVideoDuration(player.duration);
      }));
    } catch {}
    try {
      subs.push(player.addListener("timeUpdate", ({ currentTime: ct }: any) => {
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
  }, [player]);

  useEffect(() => {
    StatusBar.setHidden(true);
    return () => { StatusBar.setHidden(false); };
  }, []);

  const closeScreen = useCallback(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    StatusBar.setHidden(false);
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeScreen();
      return true;
    });
    return () => sub.remove();
  }, [closeScreen]);

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
      player.pause();
    } else {
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
    if (!newMuted) requestAudioFocus(() => { try { player.pause(); } catch {} });
    else releaseAudioFocus(() => { try { player.pause(); } catch {} });
    resetControlsTimer();
  }, [player, isMuted, resetControlsTimer]);

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

  const panGesture = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetX([-10, 10])
    .enabled(!isLandscape)
    .onUpdate((e) => {
      if (isDismissing.current) return;
      const dy = Math.max(0, e.translationY);
      translateY.value = dy;
      opacity.value = interpolate(dy, [0, DISMISS_THRESHOLD * 2], [1, 0.3], Extrapolation.CLAMP);
    })
    .onEnd((e) => {
      if (isDismissing.current) return;
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
              <VideoView
                player={player}
                contentFit="contain"
                nativeControls={false}
                allowsPictureInPicture={true}
                // Leaving the app mid-video pops the player out into a floating
                // window instead of stopping it. allowsPictureInPicture alone
                // only permits PiP, it never enters it — which is why PiP has
                // been technically enabled here and invisible in practice.
                // Android 12+ and iOS; a no-op everywhere else.
                startsPictureInPictureAutomatically={true}
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

      {showControls && (
        <View
          style={[
            styles.controlsOverlay,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.topBar} pointerEvents="box-none">
            <Pressable
              onPress={closeScreen}
              style={styles.glassButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close video"
            >
              <BlurView
                intensity={Platform.OS === "ios" ? 60 : 40}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.glassOverlay} />
              <Icon name="X" size={20} color="#fff" />
            </Pressable>

            <View style={{ flex: 1 }} />

            <View style={styles.topButtonGroup}>
              <Pressable
                onPress={handleToggleMute}
                style={styles.glassButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={isMuted ? "Unmute" : "Mute"}
              >
                <BlurView
                  intensity={Platform.OS === "ios" ? 60 : 40}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.glassOverlay} />
                <Icon name={isMuted ? "VolumeX" : "Volume2"} size={20} color="#fff" />
              </Pressable>
              <Pressable
                onPress={handleToggleRotation}
                style={styles.glassButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Rotate orientation"
              >
                <BlurView
                  intensity={Platform.OS === "ios" ? 60 : 40}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.glassOverlay} />
                <Icon name={isLandscape ? "Minimize2" : "RotateCcw"} size={20} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.centerControls} pointerEvents="box-none">
            <Pressable
              onPress={handleTogglePlay}
              style={styles.glassPlayButton}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
            >
              <BlurView
                intensity={Platform.OS === "ios" ? 60 : 40}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.glassOverlay} />
              <Icon name={isPlaying ? "Pause" : "Play"} size={32} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.bottomBar} pointerEvents="box-none">
            {videoDuration > 0 && (
              <View style={styles.progressRow}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Pressable
                  style={styles.progressTrack}
                  onPress={(e) => handleSeek(e.nativeEvent.locationX)}
                  onLayout={(e) => { progressTrackWidthRef.current = e.nativeEvent.layout.width; }}
                  accessibilityRole="adjustable"
                  accessibilityLabel={`Video progress: ${Math.round(progressPercent)}%`}
                  accessibilityHint="Tap to seek to a specific position"
                >
                  <View style={styles.progressTrackInner}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                    <View style={[styles.progressThumb, { left: `${progressPercent}%`, marginLeft: -8 }]} />
                  </View>
                </Pressable>
                <Text style={styles.timeText}>{formatTime(videoDuration)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

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
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
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
    backgroundColor: "rgba(0,0,0,0.45)",
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
    height: 24,
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
