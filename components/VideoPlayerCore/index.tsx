import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  GestureResponderEvent,
  PanResponder,
  Animated,
  Dimensions,
} from "react-native";
import { VideoView, useVideoPlayer, VideoPlayer } from "expo-video";
import { setAudioModeAsync } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import TopControls from "./TopControls";
import CenterControls from "./CenterControls";
import ProgressBar from "./ProgressBar";
import SeekOverlay from "./SeekOverlay";
// import MiniPlayerOverlay from './MiniPlayerOverlay';
import * as ScreenOrientation from "expo-screen-orientation";
import { useNavigation } from "@react-navigation/native";

interface VideoPlayerCoreProps {
  sourceUrl: string | null;
  autoplay?: boolean;
  loop?: boolean;
  initialMuted?: boolean;
  onReady?(durationMs: number): void;
  onPlayStateChange?(playing: boolean): void;
  onProgress?(positionMs: number, durationMs: number): void;
  onClose?(): void;
}

const HIDE_DELAY = 3000;

const formatTime = (ms: number) => {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const VideoPlayerCore: React.FC<VideoPlayerCoreProps> = ({
  sourceUrl,
  autoplay = true,
  loop = true,
  initialMuted = false,
  onReady,
  onPlayStateChange,
  onProgress,
  onClose,
}) => {
  const viewRef = useRef<VideoView | null>(null);
  const navigation = useNavigation<any>();
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  // Always start unmuted regardless of prop (platforms may still gate autoplay sound by policy)
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0); // ms
  const [position, setPosition] = useState(0); // ms
  const [isBuffering, setIsBuffering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  // Minimize feature (temporarily disabled)
  // const [isMinimized, setIsMinimized] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Seek feedback overlay
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const seekOpacity = useRef(new Animated.Value(0)).current;
  const showSeekFeedback = (label: string) => {
    setSeekFeedback(label);
    seekOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(seekOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.delay(380),
      Animated.timing(seekOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setSeekFeedback(null);
    });
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setShowControls(false), HIDE_DELAY);
  };

  // Create VideoPlayer instance
  const player: VideoPlayer = useVideoPlayer(sourceUrl ?? null, (player) => {
    player.loop = loop;
    player.muted = false; // start unmuted per behavior above
    player.timeUpdateEventInterval = 0.25; // smoothish progress updates
    if (autoplay) player.play();
  });

  // Subscribe to player events and reflect into local state
  useEffect(() => {
    const subs = [
      player.addListener("playingChange", ({ isPlaying }) => {
        setIsPlaying(isPlaying);
        onPlayStateChange?.(isPlaying);
      }),
      player.addListener("statusChange", ({ status }) => {
        setIsBuffering(status === "loading");
        if (!isReady && (status === "readyToPlay" || status === "loading")) {
          setIsReady(true);
        }
      }),
      player.addListener("sourceLoad", ({ duration: durSec }) => {
        const durMs = Math.max(0, Math.floor((durSec ?? 0) * 1000));
        if (durMs && durMs !== duration) {
          setDuration(durMs);
          onReady?.(durMs);
        }
      }),
      player.addListener("timeUpdate", ({ currentTime, bufferedPosition: buf }) => {
        const curMs = Math.max(0, Math.floor((currentTime ?? 0) * 1000));
        setPosition((prev) => (prev !== curMs ? curMs : prev));
        onProgress?.(curMs, duration);
        if (typeof buf === "number" && buf >= 0) {
          setBufferedPosition(Math.floor(buf * 1000));
        }
      }),
    ];
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, onPlayStateChange, onReady, onProgress, isReady, duration]);

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    player.muted = next;
    setIsMuted(next);
  }, [isMuted, player]);

  const toggleFullscreen = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    try {
      if (fullscreen) {
        await view.exitFullscreen();
        setFullscreen(false);
        try {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
        } catch {}
      } else {
        await view.enterFullscreen();
        setFullscreen(true);
        try {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE
          );
        } catch {}
      }
    } catch (e) {
      console.warn("Fullscreen toggle error", e);
    }
  }, [fullscreen]);

  // Remove separate rotate control; fullscreen button controls rotation

  const showAndScheduleHide = () => {
    setShowControls(true);
    scheduleHide();
  };

  const handleSurfacePress = () => {
    // Not used directly after simplifying tap logic, kept for potential future usage
    if (!showControls) showAndScheduleHide();
    else scheduleHide();
  };

  // // Mini player drag & snap logic (disabled)
  // const screen = Dimensions.get('window');
  // const MINI_WIDTH = 180;
  // const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
  // const MARGIN = 12;
  // const initialMini = { x: screen.width - MINI_WIDTH - MARGIN, y: screen.height - MINI_HEIGHT - (80 + MARGIN) };
  // const miniPos = useRef(new Animated.ValueXY(initialMini)).current; // bottom-right above nav
  // const miniDragging = useRef(false);
  // const latestMiniRef = useRef(initialMini);
  // const miniPanResponder = useRef(
  //   PanResponder.create({
  //     onStartShouldSetPanResponder: () => true,
  //     onMoveShouldSetPanResponder: () => true,
  //     onPanResponderGrant: () => { miniDragging.current = true; miniPos.stopAnimation(); },
  //     onPanResponderMove: (_, g) => {
  //       const nx = Math.min(Math.max(g.dx + miniStartRef.current.x, 0), screen.width - MINI_WIDTH);
  //       const ny = Math.min(Math.max(g.dy + miniStartRef.current.y, 0), screen.height - MINI_HEIGHT - 80);
  //       latestMiniRef.current = { x: nx, y: ny };
  //       miniPos.setValue(latestMiniRef.current);
  //     },
  //     onPanResponderRelease: (_, g) => {
  //       miniDragging.current = false;
  //       miniStartRef.current = { ...latestMiniRef.current };
  //       const currentX = latestMiniRef.current.x;
  //       const snapLeft = currentX < (screen.width - MINI_WIDTH) / 2;
  //       const targetX = snapLeft ? MARGIN : screen.width - MINI_WIDTH - MARGIN;
  //       Animated.spring(miniPos, { toValue: { x: targetX, y: miniStartRef.current.y }, useNativeDriver: false, friction: 7 })
  //         .start(() => { miniStartRef.current = { x: targetX, y: miniStartRef.current.y }; });
  //     },
  //     onPanResponderTerminate: () => { miniDragging.current = false; },
  //     onPanResponderStart: () => { miniStartRef.current = { ...latestMiniRef.current }; }
  //   })
  // ).current;
  // const miniStartRef = useRef({ ...initialMini });

  const handleClosePress = () => {
    // Ensure portrait on close/back
    (async () => {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      } catch {}
    })();
    if (onClose) onClose();
    else navigation.goBack();
  };

  // const handleMiniExpand = () => {
  //   setIsMinimized(false);
  //   showAndScheduleHide();
  // };

  // const handleMiniHardClose = () => {
  //   setIsMinimized(false);
  //   if (onClose) onClose(); else navigation.goBack();
  // };

  // Double-tap to seek ±10s (basic implementation)
  const lastTapRef = useRef<number>(0);
  const lastSideRef = useRef<"left" | "right" | null>(null);
  const handleDoubleTap = async (side: "left" | "right") => {
    try {
      const forwardDelta = 10; // seconds
      const backwardDelta = 30; // seconds
      const delta = side === "right" ? forwardDelta : -backwardDelta;
      player.seekBy(delta);
      showSeekFeedback(side === "right" ? "+10" : "-30");
    } catch {}
  };
  const handleSurfaceTouch = (side: "left" | "right") => () => {
    const now = Date.now();
    const isDouble =
      lastSideRef.current === side && now - lastTapRef.current < 300;
    lastTapRef.current = now;
    lastSideRef.current = side;
    if (isDouble) {
      handleDoubleTap(side);
      // Keep controls visible on double for feedback
      showAndScheduleHide();
      return;
    }
    // Single tap: immediately show controls
    showAndScheduleHide();
  };

  useEffect(() => {
    showAndScheduleHide();
    // Configure audio to play even if device is on silent (iOS)
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: "doNotMix",
          interruptionModeAndroid: "duckOthers",
        });
        // Ensure unmuted (some devices may default to muted on autoplay)
        setIsMuted(false);
      } catch (e) {
        console.warn("[VideoPlayerCore] setAudioModeAsync failed", e);
      }
    })();
    return () => {
      // On unmount, ensure portrait and clear timer
      try {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      } catch {}
      clearHideTimer();
    };
  }, []);

  const seekToRatio = async (ratio: number) => {
    if (!duration) return;
    const newPosMs = Math.min(Math.max(ratio, 0), 1) * duration;
    try {
      player.currentTime = newPosMs / 1000;
      setPosition(newPosMs);
    } catch {}
  };

  const onProgressBarPress = (e: GestureResponderEvent) => {
    const { locationX } = e.nativeEvent;
    if (!progressBarWidth) return;
    const ratio = locationX / progressBarWidth;
    seekToRatio(ratio);
    showAndScheduleHide();
  };

  // Drag (scrub) support
  const draggingRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        draggingRef.current = true;
        showAndScheduleHide();
        if (progressBarWidth) {
          const ratio = evt.nativeEvent.locationX / progressBarWidth;
          seekToRatio(ratio);
        }
      },
      onPanResponderMove: (evt, gesture) => {
        if (!draggingRef.current) return;
        if (progressBarWidth) {
          const x = Math.min(
            Math.max(evt.nativeEvent.locationX, 0),
            progressBarWidth
          );
          const ratio = x / progressBarWidth;
          seekToRatio(ratio);
        }
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        scheduleHide();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        scheduleHide();
      },
    })
  ).current;

  // Track buffered position (from timeUpdate event in seconds -> ms)
  const [bufferedPosition, setBufferedPosition] = useState(0);

  return (
    <View className="w-full aspect-video bg-black overflow-hidden">
      {sourceUrl && (
        <VideoView
          ref={(r) => (viewRef.current = r)}
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          nativeControls={false}
          onFullscreenEnter={() => setFullscreen(true)}
          onFullscreenExit={() => setFullscreen(false)}
        />
      )}
      {!sourceUrl && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" />
        </View>
      )}
      {/* Interaction layers */}
      <View
        className="absolute inset-0 flex-row"
        // Disable double-tap capture when controls are visible so user can interact with progress bar
        pointerEvents={showControls ? "none" : "auto"}
      >
        <Pressable className="flex-1" onPress={handleSurfaceTouch("left")} />
        <Pressable className="flex-1" onPress={handleSurfaceTouch("right")} />
      </View>
      {showControls && (
        <View className="absolute inset-0 justify-between px-2 py-2">
          <TopControls
            onClose={handleClosePress}
            onMute={toggleMute}
            onFullscreen={toggleFullscreen}
            isMuted={isMuted}
            fullscreen={fullscreen}
          />
          <CenterControls
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            onTogglePlay={togglePlay}
            onSeekBack={() => handleDoubleTap("left")}
            onSeekForward={() => handleDoubleTap("right")}
          />
          <ProgressBar
            position={position}
            duration={duration}
            bufferedPosition={bufferedPosition}
            onLayoutWidth={(w) => setProgressBarWidth(w)}
            onPressBar={(x) => {
              if (!progressBarWidth) return;
              const ratio = x / progressBarWidth;
              seekToRatio(ratio);
              showAndScheduleHide();
            }}
            panHandlers={panResponder.panHandlers}
          />
        </View>
      )}
      {seekFeedback && (
        <SeekOverlay label={seekFeedback} opacity={seekOpacity} />
      )}
      {/* Mini Player Overlay (disabled) */}
      {false && <View />}
    </View>
  );
};

export default VideoPlayerCore;
