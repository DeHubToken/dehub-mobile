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
      isPlaying ? _copy("copy.e159b06187d3", { defaultValue: "Paused" }) : _copy("copy.deaf6f9d23bc", { defaultValue: "Playing" })
    );
  }, [onTogglePlay, isPlaying, _copy]);

  const handleSeekBack = useCallback(() => {
    onSeekBack();
    AccessibilityInfo.announceForAccessibility(
      _copy("copy.919a3ccadb3f", { defaultValue: "Rewinding {{count}} seconds", count: PLAYER_CONSTANTS.SEEK_BACKWARD_SECONDS })
    );
  }, [onSeekBack, _copy]);

  const handleSeekForward = useCallback(() => {
    onSeekForward();
    AccessibilityInfo.announceForAccessibility(
      _copy("copy.8fbfb637ace6", { defaultValue: "Skipping forward {{count}} seconds", count: PLAYER_CONSTANTS.SEEK_FORWARD_SECONDS })
    );
  }, [onSeekForward, _copy]);

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
            <View style={isPlaying ? undefined : { marginLeft: 4 }}><Icon
              name={isPlaying ? 'Pause' : 'Play'}
              size={38}
              color="#fff"
            /></View>
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
