import React, { memo, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { formatTime, getProgressRatio } from './utils';

interface ProgressBarProps {
  position: number;
  duration: number;
  bufferedPosition: number;
  onLayoutWidth: (width: number) => void;
  onPressBar: (x: number) => void;
  panGesture: ReturnType<typeof Gesture.Pan>;
  liveMode?: boolean;
  isSeeking?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  position,
  duration,
  bufferedPosition,
  onLayoutWidth,
  onPressBar,
  panGesture,
  liveMode = false,
  isSeeking = false,
}) => {
  const progressRatio = useMemo(
    () => getProgressRatio(position, duration),
    [position, duration]
  );

  const bufferedRatio = useMemo(
    () => getProgressRatio(bufferedPosition, duration),
    [bufferedPosition, duration]
  );

  const formattedPosition = useMemo(() => formatTime(position), [position]);
  const formattedDuration = useMemo(() => formatTime(duration), [duration]);
  const remainingTime = useMemo(
    () => formatTime(Math.max(0, duration - position)),
    [duration, position]
  );

  // Animated style for scrubber thumb scale
  const scrubberAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isSeeking ? 1.3 : 1, { damping: 15 }) }],
  }));

  const progressBarContent = (
    <View
      className={`h-1.5 w-full rounded-full overflow-hidden ${
        liveMode ? 'bg-red-500/40' : 'bg-white/20'
      }`}
    >
      {!liveMode && (
        <>
          {/* Buffered Progress */}
          <View
            style={{ width: `${bufferedRatio * 100}%` }}
            className="h-full bg-white/30 rounded-full absolute left-0 top-0"
          />

          {/* Playback Progress */}
          <View
            style={{ width: `${progressRatio * 100}%` }}
            className="h-full bg-theme-accent rounded-full"
          />
        </>
      )}

      {/* Live Indicator */}
      {liveMode && (
        <View className="h-full w-full bg-red-500 rounded-full" />
      )}
    </View>
  );

  return (
    <View className="px-1">
      {/* Time Labels */}
      <View className="flex-row justify-between items-center mb-2">
        <Text
          className="text-white text-xs font-medium"
          accessibilityLabel={`Current position: ${formattedPosition}`}
        >
          {liveMode ? (
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-red-500 mr-1.5" />
              <Text className="text-white text-xs font-semibold">LIVE</Text>
            </View>
          ) : (
            formattedPosition
          )}
        </Text>
        <Text
          className="text-white/70 text-xs font-medium"
          accessibilityLabel={`Duration: ${formattedDuration}`}
        >
          {liveMode ? '' : `-${remainingTime}`}
        </Text>
      </View>

      {/* Progress Bar Track */}
      <Pressable
        onLayout={(e) => onLayoutWidth(e.nativeEvent.layout.width)}
        onPress={(e) => !liveMode && onPressBar(e.nativeEvent.locationX)}
        className="h-8 justify-center"
        accessibilityRole="adjustable"
        accessibilityLabel={`Video progress: ${Math.round(progressRatio * 100)}%`}
        accessibilityHint="Tap to seek to a specific position"
      >
        {liveMode ? (
          progressBarContent
        ) : (
          <GestureDetector gesture={panGesture}>
            <Animated.View>{progressBarContent}</Animated.View>
          </GestureDetector>
        )}

        {/* Scrubber Thumb (only in non-live mode) */}
        {!liveMode && (
          <Animated.View
            style={[
              {
                left: `${progressRatio * 100}%`,
                marginLeft: -8,
                position: 'absolute',
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#3B82F6',
              },
              scrubberAnimatedStyle,
            ]}
            pointerEvents="none"
          >
            {/* Inner dot for better visibility */}
            <View className="absolute inset-1 rounded-full bg-white" />
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
};

export default memo(ProgressBar);
