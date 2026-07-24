import React, { memo, useCallback } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PLAYER_CONSTANTS } from './utils';

interface CenterControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  onTogglePlay: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  hideSeekButtons?: boolean;
}

const CenterControls: React.FC<CenterControlsProps> = ({
  isPlaying,
  isBuffering,
  onTogglePlay,
  onSeekBack,
  onSeekForward,
  hideSeekButtons = false,
}) => {
  const handleTogglePlay = useCallback(() => {
    onTogglePlay();
    AccessibilityInfo.announceForAccessibility(
      isPlaying ? 'Paused' : 'Playing'
    );
  }, [onTogglePlay, isPlaying]);

  const handleSeekBack = useCallback(() => {
    onSeekBack();
    AccessibilityInfo.announceForAccessibility(
      `Rewinding ${PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS} seconds`
    );
  }, [onSeekBack]);

  const handleSeekForward = useCallback(() => {
    onSeekForward();
    AccessibilityInfo.announceForAccessibility(
      `Skipping forward ${PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS} seconds`
    );
  }, [onSeekForward]);

  return (
    <View className="items-center justify-center">
      <View className="flex-row items-center justify-center">
        {/* Seek Backward */}
        {!hideSeekButtons && (
          <TouchableOpacity
            onPress={handleSeekBack}
            className="bg-black/60 rounded-full p-3.5 mx-4 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={`Rewind ${PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS} seconds`}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="play-back" size={28} color="#fff" />
            <Text className="text-white text-[10px] font-medium mt-0.5">
              {PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS}s
            </Text>
          </TouchableOpacity>
        )}

        {/* Play/Pause Button */}
        <TouchableOpacity
          onPress={handleTogglePlay}
          className="bg-black/70 rounded-full p-5 mx-2 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          accessibilityRole="button"
          accessibilityState={{ selected: isPlaying }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={isBuffering}
        >
          {isBuffering ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={38}
              color="#fff"
              style={isPlaying ? undefined : { marginLeft: 4 }}
            />
          )}
        </TouchableOpacity>

        {/* Seek Forward */}
        {!hideSeekButtons && (
          <TouchableOpacity
            onPress={handleSeekForward}
            className="bg-black/60 rounded-full p-3.5 mx-4 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={`Skip forward ${PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS} seconds`}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="play-forward" size={28} color="#fff" />
            <Text className="text-white text-[10px] font-medium mt-0.5">
              {PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS}s
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default memo(CenterControls);
