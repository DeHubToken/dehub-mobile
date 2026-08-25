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
  useWindowDimensions,
  Platform,
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
import { getPlaybackRateFor, setPlaybackRate as persistPlaybackRate } from '../../libs/video-preferences';
import { useAppPrefs } from '../../hooks/useAppPrefs';
import { useVideoSegments, segmentAt } from '../../hooks/useVideoSegments';
import { SEGMENT_LABELS } from '../../services/video-segments.service';
import { toastInfo } from '../../libs';
import {
  configureForBackgroundPlayback,
  releaseBackgroundPlayback,
} from '../../libs/audioSession';
import { Ionicons } from '@expo/vector-icons';
import TopControls from './TopControls';
import CenterControls from './CenterControls';
import ProgressBar from './ProgressBar';
import SeekOverlay from './SeekOverlay';
import CaptionOverlay from './CaptionOverlay';
import {
  PLAYER_CONSTANTS,
  SeekDirection,
} from './utils';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { revokeAudioFocus } from '../../libs/audioFocus';
import { createLogger } from '../../libs/logger';
import { getCachedMuted, setMutedState } from '../../libs/videoMutedState';

const logger = createLogger('VideoPlayerCore');

interface VideoPlayerCoreProps {
  sourceUrl: string | null;
  autoplay?: boolean;
  loop?: boolean;
  initialMuted?: boolean;
  liveMode?: boolean;
  /** Suppress the built-in top controls row when an external header already provides close/mute. */
  hideTopControls?: boolean;
  /** Numeric post id. Drives the subtitle overlay; without it there are none. */
  tokenId?: number | string | null;
  title?: string;
  /** Creator address — a rate pinned to this channel starts the video there. */
  creator?: string | null;
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
  hideTopControls = false,
  tokenId,
  title,
  creator,
  onReady,
  onPlayStateChange,
  onProgress,
  onClose,
  onError,
}) => {
  // Refs
  const viewRef = useRef<VideoView | null>(null);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' | null }>({
    time: 0,
    side: null,
  });
  const isMountedRef = useRef(true);
  const isInPiPRef = useRef(false);

  // State
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [isMuted, setIsMuted] = useState(() => getCachedMuted());
  const [showControls, setShowControls] = useState(!autoplay);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLooping, setIsLooping] = useState(loop);
  const [playbackRate, setPlaybackRate] = useState(() => (liveMode ? 1 : getPlaybackRateFor(creator)));
  const [isInPiP, setIsInPiP] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

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
    p.muted = getCachedMuted();
    p.timeUpdateEventInterval = PLAYER_CONSTANTS.TIME_UPDATE_INTERVAL;
    // A rate pinned to this creator applies from the first frame. Live has no
    // meaningful rate, so liveMode never carries one through.
    if (!liveMode) p.playbackRate = getPlaybackRateFor(creator);
    // This player only ever mounts on a surface the user navigated to on
    // purpose — the live-stream viewer — never on a feed card. Backgrounding
    // it should move the sound to the lock screen, not end it.
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    if (autoplay && sourceUrl) {
      p.play();
    }
  });

  // Crowdsourced sponsor reads and intros. Never on a live stream — there is
  // nothing to skip past in something that has not happened yet.
  const { skipSegments: skipSegmentsPref } = useAppPrefs();
  const skipSegmentsOn = skipSegmentsPref && !liveMode;
  const { segments: skipSegments } = useVideoSegments(
    tokenId ?? undefined,
    skipSegmentsOn && !!sourceUrl,
  );
  // Segments already jumped this session. Without it, scrubbing back into one
  // by hand would be undone by the next progress tick.
  const skippedRef = useRef<Set<string>>(new Set());
  const skipSegmentsRef = useRef(skipSegments);
  useEffect(() => {
    skipSegmentsRef.current = skipSegments;
  }, [skipSegments]);
  const skipOnRef = useRef(skipSegmentsOn);
  useEffect(() => {
    skipOnRef.current = skipSegmentsOn;
  }, [skipSegmentsOn]);

  /**
   * Read from refs: the timeUpdate listener is subscribed per player and would
   * otherwise close over the first render's empty list.
   */
  const maybeSkipSegment = useCallback(
    (seconds: number) => {
      if (!skipOnRef.current) return;
      const segment = segmentAt(skipSegmentsRef.current, seconds);
      if (!segment || skippedRef.current.has(segment.id)) return;
      skippedRef.current.add(segment.id);
      // Where they were when the jump fired, so Undo lands back at the start
      // of the sponsor read rather than at zero.
      const resumeAt = seconds;
      player.currentTime = segment.end_seconds;
      toastInfo(`${SEGMENT_LABELS[segment.category]} skipped`, {
        actionLabel: 'Undo',
        onActionPress: () => {
          player.currentTime = resumeAt;
        },
        duration: 4000,
      });
    },
    [player],
  );

  // Subscribe to player events
  useEffect(() => {
    const subscriptions = [
      player.addListener('playingChange', ({ isPlaying: playing }) => {
        if (!isMountedRef.current) return;
        setIsPlaying(playing);
        onPlayStateChange?.(playing);
        if (playing) revokeAudioFocus();
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
          maybeSkipSegment(currentTime ?? 0);

          if (typeof buf === 'number' && buf >= 0) {
            setBufferedPosition(Math.floor(buf * 1000));
          }
        }
      ),
    ];

    return () => {
      subscriptions.forEach((sub) => sub.remove());
    };
  }, [player, onPlayStateChange, onReady, onProgress, isReady, duration, onError, maybeSkipSegment]);

  // Handle navigation events to stop playback when leaving screen
  // Guard with isInPiPRef — returning from PiP also triggers beforeRemove
  // which would close the screen and crash the app
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (isInPiPRef.current) {
        e.preventDefault();
        return;
      }
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
      clearHideTimer();
    } else {
      player.play();
      scheduleHide();
    }
  }, [player, clearHideTimer, scheduleHide]);

  const toggleLoop = useCallback(() => {
    const nextLoop = !isLooping;
    player.loop = nextLoop;
    setIsLooping(nextLoop);
  }, [isLooping, player]);

  const toggleSpeed = useCallback(() => {
    const currentSpeed = player.playbackRate;
    let nextSpeed = 1.0;
    if (currentSpeed === 1.0) nextSpeed = 1.5;
    else if (currentSpeed === 1.5) nextSpeed = 2.0;
    else nextSpeed = 1.0;
    player.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
    // Remembered against the creator: this channel opens at this rate next
    // time, everyone else is unaffected.
    if (!liveMode) persistPlaybackRate(nextSpeed, creator);
  }, [player, liveMode, creator]);

  const handlePiPStart = useCallback(() => {
    isInPiPRef.current = true;
    setIsInPiP(true);
  }, []);

  const handlePiPStop = useCallback(() => {
    isInPiPRef.current = false;
    setIsInPiP(false);
  }, []);

  const handlePiP = useCallback(async () => {
    try {
      if (!viewRef.current || !(viewRef.current as any).startPictureInPicture) return;
      // Exit fullscreen/landscape before entering PiP — orientation lock conflicts with PiP
      if (isLandscape) {
        setIsLandscape(false);
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        ).catch(() => {});
      }
      if (fullscreen) {
        setFullscreen(false);
        StatusBar.setHidden(false);
      }
      await (viewRef.current as any).startPictureInPicture();
    } catch (error) {
      logger.warn('[VideoPlayerCore] PiP error:', error);
    }
  }, [fullscreen, isLandscape]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    player.muted = nextMuted;
    setIsMuted(nextMuted);
    setMutedState(nextMuted);
  }, [isMuted, player]);

  // Landscape state tracks whether the video is rotated sideways

  // Fullscreen: toggle portrait fullscreen (immersive, no status bar)
  const toggleFullscreen = useCallback(async () => {
    try {
      if (fullscreen) {
        setFullscreen(false);
        StatusBar.setHidden(false);
        // If we were landscape, also reset to portrait orientation
        if (isLandscape) {
          setIsLandscape(false);
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          ).catch(() => {});
        }
      } else {
        setFullscreen(true);
        StatusBar.setHidden(true);
        // Stay in current orientation (portrait fullscreen)
      }
    } catch (error) {
      logger.warn('[VideoPlayerCore] Fullscreen toggle error:', error);
    }
  }, [fullscreen, isLandscape]);

  // Rotate: toggle between landscape and portrait orientation
  const handleRotateToPortrait = useCallback(async () => {
    try {
      if (isLandscape) {
        // Currently landscape → rotate back to portrait
        setIsLandscape(false);
        if (!fullscreen) {
          StatusBar.setHidden(false);
        }
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        ).catch(() => {});
      } else {
        // Currently portrait → rotate to landscape
        setIsLandscape(true);
        setFullscreen(true);
        StatusBar.setHidden(true);
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        ).catch(() => {});
      }
    } catch (error) {
      logger.warn('[VideoPlayerCore] Rotate orientation error:', error);
    }
  }, [isLandscape, fullscreen]);

  // Close handler - ensure portrait orientation and stop playback
  const handleClosePress = useCallback(() => {
    // Stop playback immediately to prevent lingering audio
    try {
      player.pause();
      player.muted = true;
    } catch {}

    // Reset all states and orientation
    setFullscreen(false);
    setIsLandscape(false);
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
    if (!autoplay) {
      showAndScheduleHide();
    }

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

  // Configure audio to play even if device is on silent (iOS), and to keep
  // playing once the app is backgrounded.
  //
  // This used to pass `shouldPlayInBackground: fullscreen`, which meant the
  // sound survived leaving the app only if you happened to be in fullscreen at
  // that moment — the same stream, watched inline, stopped dead. Nothing about
  // the fullscreen flag says anything about whether the user wants to keep
  // listening, so it never should have been the condition.
  useEffect(() => {
    configureForBackgroundPlayback().catch((error) => {
      logger.warn('[VideoPlayerCore] configureForBackgroundPlayback failed:', error);
    });

    return () => {
      // Hand the category back on the way out. It is global to the process and
      // the last writer wins, so leaving it background-capable would quietly
      // change the terms for whatever plays next.
      releaseBackgroundPlayback().catch(() => {});
    };
  }, []);

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

  // useWindowDimensions automatically updates when orientation changes,
  // unlike Dimensions.get('window') which is a one-time snapshot.
  const { width: screenW, height: screenH } = useWindowDimensions();

  const fullscreenStyle = fullscreen
    ? ({
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: screenW,
        height: screenH,
        zIndex: 9999,
        elevation: 9999, // Android
        backgroundColor: '#000',
      })
    : undefined;

  return (
    <View
      className={fullscreen ? '' : 'w-full aspect-video bg-black overflow-hidden'}
      style={fullscreenStyle}
    >
      {/* Video View — always mounted, never moves between trees */}
      {sourceUrl && (
        <VideoView
          ref={(r) => {
            viewRef.current = r as VideoView | null;
          }}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          // Was gated on `fullscreen` for the same non-reason as the audio
          // session above: wanting the video to follow you out of the app has
          // nothing to do with how large it currently is on screen.
          allowsPictureInPicture={true}
          startsPictureInPictureAutomatically={true}
          onPictureInPictureStart={handlePiPStart}
          onPictureInPictureStop={handlePiPStop}
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
            <Ionicons name="alert-circle" size={46} color="#8B8D90" />
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
        <View
          className="absolute inset-0 justify-between"
          style={{
            paddingTop: fullscreen ? insets.top + 8 : 12,
            paddingBottom: fullscreen ? insets.bottom + 36 : 12,
            paddingLeft: fullscreen
              ? Math.max(insets.left, insets.right, 16)
              : 12,
            paddingRight: fullscreen
              ? Math.max(insets.left, insets.right, 16)
              : 12,
          }}
        >
          {/* Top Controls — suppressed when an external header already provides them */}
          {hideTopControls ? (
            <View />
          ) : (
            <TopControls
              onClose={handleClosePress}
              onMute={toggleMute}
              onFullscreen={toggleFullscreen}
              onRotateToPortrait={handleRotateToPortrait}
              onPiP={handlePiP}
              onToggleLoop={toggleLoop}
              onToggleSpeed={toggleSpeed}
              isMuted={isMuted}
              fullscreen={fullscreen}
              isLooping={isLooping}
              playbackRate={playbackRate}
              title={title}
              showTitle={fullscreen}
            />
          )}

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

      {/* Subtitles. Outside the controls block on purpose: hiding the chrome
          must not take the captions with it. */}
      <CaptionOverlay
        tokenId={tokenId}
        positionMs={position}
        controlsVisible={showControls}
        bottomOffset={showControls ? 68 : 24}
      />

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
