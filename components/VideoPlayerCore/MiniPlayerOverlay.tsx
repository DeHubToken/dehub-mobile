import React, { memo, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  AnimatedStyle,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer, VideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { getProgressRatio } from './utils';

interface MiniPlayerOverlayProps {
  sourceUrl: string | null;
  animatedStyle: AnimatedStyle;
  width: number;
  height: number;
  panGesture: ReturnType<typeof Gesture.Pan>;
  onExpand: () => void;
  onClose: () => void;
  isPlaying: boolean;
  isMuted: boolean;
  loop: boolean;
  duration: number;
  position: number;
  videoRef: React.MutableRefObject<VideoView | null>;
}

const MiniPlayerOverlay: React.FC<MiniPlayerOverlayProps> = ({
  sourceUrl,
  animatedStyle: containerAnimatedStyle,
  width,
  height,
  panGesture,
  onExpand,
  onClose,
  isPlaying,
  isMuted,
  loop,
  duration,
  position,
  videoRef,
}) => {
  // Create player instance
  const player: VideoPlayer = useVideoPlayer(sourceUrl ?? null, (p) => {
    p.loop = loop;
    p.muted = isMuted;
    if (isPlaying) {
      p.play();
    } else {
      p.pause();
    }
  });

  // Sync loop setting
  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  // Sync mute setting
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  // Sync play state
  useEffect(() => {
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying, player]);

  const handleExpand = useCallback(() => {
    onExpand();
  }, [onExpand]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const progressRatio = getProgressRatio(position, duration);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          {
            width,
            height: height + 18,
          },
          containerAnimatedStyle,
        ]}
      >
        <Pressable
          onPress={handleExpand}
          style={styles.pressable}
          accessibilityLabel="Expand video player"
          accessibilityRole="button"
        >
          {sourceUrl ? (
            <VideoView
              ref={(r) => {
                videoRef.current = r as VideoView | null;
              }}
              player={player}
              style={styles.video}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" />
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close mini player"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={14} color="#fff" />
          </TouchableOpacity>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${progressRatio * 100}%` },
              ]}
            />
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  pressable: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#3B82F6', // theme-accent color
  },
});

export default memo(MiniPlayerOverlay);
