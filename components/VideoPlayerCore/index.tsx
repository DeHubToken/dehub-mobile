import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer, VideoPlayer } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import TopControls from './TopControls';
import CenterControls from './CenterControls';
import ProgressBar from './ProgressBar';
import SeekOverlay from './SeekOverlay';
import {
  PLAYER_CONSTANTS,
  SeekDirection,
} from './utils';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useNavigation } from '@react-navigation/native';
import { createLogger } from '../../libs/logger';

const logger = createLogger('VideoPlayerCore');

interface VideoPlayerCoreProps {
  sourceUrl: string | null;
  autoplay?: boolean;
  loop?: boolean;
  initialMuted?: boolean;
  liveMode?: boolean;
  title?: string;
  onReady?: (durationMs: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onProgress?: (positionMs: number, durationMs: number) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
}

const VideoPlayerCore: React.FC<VideoPlayerCoreProps> = ({
  sourceUrl,
  autoplay = true,
  loop = true,
  initialMuted = false,
  liveMode = false,
  title,
  onReady,
  onPlayStateChange,
  onProgress,
  onClose,
  onError,
}) => {
  // Refs
  const viewRef = useRef<VideoView | null>(null);
  const navigation = useNavigation<any>();
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' | null }>({
    time: 0,
    side: null,
  });
  const isMountedRef = useRef(true);

  // State
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Seek feedback animation
  const [seekFeedback, setSeekFeedback] = useState<{
    label: string;
    direction: SeekDirection;
  } | null>(null);
  const seekOpacity = useSharedValue(0);

  // Callback to clear seek feedback (called from worklet)
  const clearSeekFeedback = useCallback(() => {
    if (isMountedRef.current) {
      setSeekFeedback(null);
    }
  }, []);

  // Show seek feedback overlay with animation
  const showSeekFeedback = useCallback(
    (label: string, direction: SeekDirection) => {
      if (!isMountedRef.current) return;

      setSeekFeedback({ label, direction });
      
      seekOpacity.value = withSequence(
        withTiming(1, {
          duration: PLAYER_CONSTANTS.SEEK_FADE_IN_DURATION,
          easing: Easing.out(Easing.ease),
        }),
        withDelay(
          PLAYER_CONSTANTS.SEEK_VISIBLE_DURATION,
          withTiming(0, {
            duration: PLAYER_CONSTANTS.SEEK_FADE_OUT_DURATION,
            easing: Easing.in(Easing.ease),
          })
        )
      );

      // Clear feedback after animation completes
      setTimeout(() => {
        clearSeekFeedback();
      }, PLAYER_CONSTANTS.SEEK_FADE_IN_DURATION + PLAYER_CONSTANTS.SEEK_VISIBLE_DURATION + PLAYER_CONSTANTS.SEEK_FADE_OUT_DURATION);
    },
    [seekOpacity, clearSeekFeedback]
  );

  // Timer management for hiding controls
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setShowControls(false);
      }
    }, PLAYER_CONSTANTS.HIDE_CONTROLS_DELAY);
  }, [clearHideTimer]);

  const showAndScheduleHide = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  // Create VideoPlayer instance
  const player: VideoPlayer = useVideoPlayer(sourceUrl ?? null, (p) => {
    p.loop = loop;
    p.muted = initialMuted;
    p.timeUpdateEventInterval = PLAYER_CONSTANTS.TIME_UPDATE_INTERVAL;
    if (autoplay && sourceUrl) {
      p.play();
    }
  });

  // Subscribe to player events
  useEffect(() => {
    const subscriptions = [
      player.addListener('playingChange', ({ isPlaying: playing }) => {
        if (!isMountedRef.current) return;
        setIsPlaying(playing);
        onPlayStateChange?.(playing);
      }),

      player.addListener('statusChange', ({ status, error }) => {
        if (!isMountedRef.current) return;

        setIsBuffering(status === 'loading');

        if (status === 'error' && error) {
          setHasError(true);
          logger.error('[VideoPlayerCore] Playback error:', error);
          onError?.(new Error(String(error)));
        }

        if (!isReady && (status === 'readyToPlay' || status === 'loading')) {
          setIsReady(true);
          setHasError(false);
        }
      }),

      player.addListener('sourceLoad', ({ duration: durSec }) => {
        if (!isMountedRef.current) return;
        const durMs = Math.max(0, Math.floor((durSec ?? 0) * 1000));
        if (durMs && durMs !== duration) {
          setDuration(durMs);
          onReady?.(durMs);
        }
      }),

      player.addListener(
        'timeUpdate',
        ({ currentTime, bufferedPosition: buf }) => {
          if (!isMountedRef.current) return;
          const curMs = Math.max(0, Math.floor((currentTime ?? 0) * 1000));
          setPosition((prev) => (prev !== curMs ? curMs : prev));
          onProgress?.(curMs, duration);

          if (typeof buf === 'number' && buf >= 0) {
            setBufferedPosition(Math.floor(buf * 1000));
          }
        }
      ),
    ];

    return () => {
      subscriptions.forEach((sub) => sub.remove());
    };
  }, [player, onPlayStateChange, onReady, onProgress, isReady, duration, onError]);

  // Handle navigation events to stop playback when leaving screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      // Stop playback immediately when navigating away
      try {
        player.pause();
        player.muted = true;
      } catch {}
    });

    return unsubscribe;
  }, [navigation, player]);

  // Playback controls
  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    player.muted = nextMuted;
    setIsMuted(nextMuted);
  }, [isMuted, player]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (fullscreen) {
        setFullscreen(false);
        StatusBar.setHidden(false);
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        ).catch(() => {});
      } else {
        setFullscreen(true);
        StatusBar.setHidden(true);
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        ).catch(() => {});
      }
    } catch (error) {
      logger.warn('[VideoPlayerCore] Fullscreen toggle error:', error);
    }
  }, [fullscreen]);

  // Rotate to portrait while staying in fullscreen mode (like YouTube)
  const handleRotateToPortrait = useCallback(async () => {
    try {
      setFullscreen(false);
      StatusBar.setHidden(false);
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {});
    } catch (error) {
      logger.warn('[VideoPlayerCore] Rotate to portrait error:', error);
    }
  }, []);

  // Close handler - ensure portrait orientation and stop playback
  const handleClosePress = useCallback(() => {
    // Stop playback immediately to prevent lingering audio
    try {
      player.pause();
      player.muted = true;
    } catch {}

    // Reset orientation and status bar
    StatusBar.setHidden(false);
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});

    if (onClose) {
      onClose();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [onClose, navigation, player]);

  // Seek functionality
  const seekToPosition = useCallback(
    (positionMs: number) => {
      if (liveMode || !duration) return;
      const clampedPosition = Math.min(Math.max(positionMs, 0), duration);
      try {
        player.currentTime = clampedPosition / 1000;
        setPosition(clampedPosition);
      } catch (error) {
        logger.warn('[VideoPlayerCore] Seek error:', error);
      }
    },
    [liveMode, duration, player]
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (liveMode || !duration) return;
      const clampedRatio = Math.min(Math.max(ratio, 0), 1);
      seekToPosition(clampedRatio * duration);
    },
    [liveMode, duration, seekToPosition]
  );

  const handleSeek = useCallback(
    (direction: SeekDirection) => {
      if (liveMode) return;

      const delta =
        direction === 'forward'
          ? PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS
          : -PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS;

      try {
        player.seekBy(delta);
        const label =
          direction === 'forward'
            ? `+${PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS}`
            : `-${PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS}`;
        showSeekFeedback(label, direction);
      } catch (error) {
        logger.warn('[VideoPlayerCore] Seek error:', error);
      }
    },
    [liveMode, player, showSeekFeedback]
  );

  // Double-tap detection for seeking
  const handleSurfaceTouch = useCallback(
    (side: 'left' | 'right') => {
      const now = Date.now();
      const { time: lastTime, side: lastSide } = lastTapRef.current;
      const isDoubleTap =
        lastSide === side &&
        now - lastTime < PLAYER_CONSTANTS.DOUBLE_TAP_DELAY;

      lastTapRef.current = { time: now, side };

      if (isDoubleTap && !liveMode) {
        handleSeek(side === 'right' ? 'forward' : 'backward');
      }

      showAndScheduleHide();
    },
    [liveMode, handleSeek, showAndScheduleHide]
  );

  // Initialize audio mode and controls visibility
  useEffect(() => {
    isMountedRef.current = true;
    showAndScheduleHide();

    // Configure audio to play even if device is on silent (iOS)
    const setupAudio = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
          interruptionModeAndroid: 'duckOthers',
        });
      } catch (error) {
        logger.warn('[VideoPlayerCore] setAudioModeAsync failed:', error);
      }
    };

    setupAudio();

    return () => {
      isMountedRef.current = false;
      clearHideTimer();

      // Stop playback immediately to prevent lingering audio
      try {
        player.pause();
        player.muted = true;
      } catch {}

      // Reset orientation on unmount
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {});

      StatusBar.setHidden(false);
    };
  }, [showAndScheduleHide, clearHideTimer, player]);

  // Progress bar press handler
  const handleProgressBarPress = useCallback(
    (locationX: number) => {
      if (liveMode || !progressBarWidth) return;
      const ratio = locationX / progressBarWidth;
      seekToRatio(ratio);
      showAndScheduleHide();
    },
    [liveMode, progressBarWidth, seekToRatio, showAndScheduleHide]
  );

  // Seeking state for gesture handler
  const startSeeking = useCallback(() => {
    setIsSeeking(true);
    showAndScheduleHide();
  }, [showAndScheduleHide]);

  const stopSeeking = useCallback(() => {
    setIsSeeking(false);
    scheduleHide();
  }, [scheduleHide]);

  const handleSeekGesture = useCallback(
    (x: number) => {
      if (liveMode || !progressBarWidth) return;
      const clampedX = Math.min(Math.max(x, 0), progressBarWidth);
      const ratio = clampedX / progressBarWidth;
      seekToRatio(ratio);
    },
    [liveMode, progressBarWidth, seekToRatio]
  );

  // Pan gesture for progress bar scrubbing using reanimated
  const progressBarPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!liveMode)
        .onStart((event) => {
          runOnJS(startSeeking)();
          runOnJS(handleSeekGesture)(event.x);
        })
        .onUpdate((event) => {
          runOnJS(handleSeekGesture)(event.x);
        })
        .onEnd(() => {
          runOnJS(stopSeeking)();
        })
        .onFinalize(() => {
          runOnJS(stopSeeking)();
        }),
    [liveMode, startSeeking, stopSeeking, handleSeekGesture]
  );

  // Container styles for fullscreen
  const containerStyle = useMemo(
    () =>
      fullscreen
        ? styles.fullscreenContainer
        : styles.normalContainer,
    [fullscreen]
  );

  return (
    <View
      className={`bg-black overflow-hidden ${
        fullscreen ? '' : 'w-full aspect-video'
      }`}
      style={containerStyle}
    >
      {/* Video View */}
      {sourceUrl && (
        <VideoView
          ref={(r) => {
            viewRef.current = r as VideoView | null;
          }}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
        />
      )}

      {/* Loading state when no source */}
      {!sourceUrl && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Error state */}
      {hasError && (
        <View className="absolute inset-0 items-center justify-center bg-black/80">
          <View className="items-center">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        </View>
      )}

      {/* Tap interaction layers */}
      <View
        className="absolute inset-0"
        pointerEvents={showControls ? 'none' : 'auto'}
      >
        {/* Center tap area */}
        <Pressable
          style={styles.centerTapArea}
          onPress={showAndScheduleHide}
          accessibilityLabel="Tap to show controls"
        />

        {/* Left double-tap zone for seeking backward */}
        <Pressable
          style={styles.leftTapZone}
          onPress={() => handleSurfaceTouch('left')}
          accessibilityLabel="Double tap to rewind"
        />

        {/* Right double-tap zone for seeking forward */}
        <Pressable
          style={styles.rightTapZone}
          onPress={() => handleSurfaceTouch('right')}
          accessibilityLabel="Double tap to skip forward"
        />
      </View>

      {/* Controls Overlay */}
      {showControls && (
        <View className="absolute inset-0 justify-between px-3 py-3">
          {/* Top Controls */}
          <TopControls
            onClose={handleClosePress}
            onMute={toggleMute}
            onFullscreen={toggleFullscreen}
            onRotateToPortrait={handleRotateToPortrait}
            isMuted={isMuted}
            fullscreen={fullscreen}
            title={title}
            showTitle={fullscreen}
          />

          {/* Center Controls */}
          <CenterControls
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            onTogglePlay={togglePlay}
            onSeekBack={() => handleSeek('backward')}
            onSeekForward={() => handleSeek('forward')}
            hideSeekButtons={liveMode}
          />

          {/* Progress Bar */}
          <ProgressBar
            position={position}
            duration={duration}
            bufferedPosition={bufferedPosition}
            onLayoutWidth={setProgressBarWidth}
            onPressBar={handleProgressBarPress}
            panGesture={progressBarPanGesture}
            liveMode={liveMode}
            isSeeking={isSeeking}
          />
        </View>
      )}

      {/* Seek Feedback Overlay */}
      {seekFeedback && (
        <SeekOverlay
          label={seekFeedback.label}
          opacity={seekOpacity}
          direction={seekFeedback.direction}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreenContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
  },
  normalContainer: {},
  video: {
    width: '100%',
    height: '100%',
  },
  centerTapArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  leftTapZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 80,
  },
  rightTapZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
  },
});

export default VideoPlayerCore;
