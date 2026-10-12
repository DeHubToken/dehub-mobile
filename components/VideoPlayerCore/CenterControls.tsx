import { useTranslation as _useCopy } from 'react-i18next';
import React, { memo, useCallback } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, AccessibilityInfo } from 'react-native';
import Icon from "../ui/Icon";
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
  const { t: _copy } = _useCopy();
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
            className="bg-zinc-900/60 rounded-2xl p-3.5 mx-4 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={_copy("copy.ba85bf0351d5", { defaultValue: "Rewind {{value1}} seconds", value1: PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS })}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="Rewind" size={28} color="#fff" />
            <Text className="text-white text-xs font-medium mt-0.5">
              {PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS}s
            </Text>
          </TouchableOpacity>
        )}

        {/* Play/Pause Button */}
        <TouchableOpacity
          onPress={handleTogglePlay}
          className="bg-zinc-900/60 rounded-2xl p-5 mx-2 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={isPlaying ? _copy("copy.858e4ba7a29f", { defaultValue: "Pause" }) : _copy("copy.436e61016e26", { defaultValue: "Play" })}
          accessibilityRole="button"
          accessibilityState={{ selected: isPlaying }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={isBuffering}
        >
          {isBuffering ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Icon
              name={isPlaying ? 'Pause' : 'Play'}
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
            className="bg-zinc-900/60 rounded-2xl p-3.5 mx-4 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={_copy("copy.e4ee35029d20", { defaultValue: "Skip forward {{value1}} seconds", value1: PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS })}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="FastForward" size={28} color="#fff" />
            <Text className="text-white text-xs font-medium mt-0.5">
              {PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS}s
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default memo(CenterControls);
