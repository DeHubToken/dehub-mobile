import React, { memo, useCallback } from 'react';
import { View, TouchableOpacity, Text, AccessibilityInfo } from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

interface TopControlsProps {
  onClose: () => void;
  onMute: () => void;
  onFullscreen: () => void;
  onRotateToPortrait?: () => void;
  onPiP?: () => void;
  onToggleLoop?: () => void;
  onToggleSpeed?: () => void;
  isMuted: boolean;
  fullscreen: boolean;
  isLooping?: boolean;
  playbackRate?: number;
  title?: string;
  showTitle?: boolean;
}

const TopControls: React.FC<TopControlsProps> = ({
  onClose,
  onMute,
  onFullscreen,
  onRotateToPortrait,
  onPiP,
  onToggleLoop,
  onToggleSpeed,
  isMuted,
  fullscreen,
  isLooping = true,
  playbackRate = 1,
  title,
  showTitle = false,
}) => {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleMute = useCallback(() => {
    onMute();
    AccessibilityInfo.announceForAccessibility(
      isMuted ? 'Sound on' : 'Sound muted'
    );
  }, [onMute, isMuted]);

  const handleFullscreen = useCallback(() => {
    onFullscreen();
    AccessibilityInfo.announceForAccessibility(
      fullscreen ? 'Exiting fullscreen' : 'Entering fullscreen'
    );
  }, [onFullscreen, fullscreen]);

  return (
    <View className="flex-row justify-between items-center">
      {/* Left side - Close button */}
      <View className="flex-row items-center flex-1">
        <TouchableOpacity
          onPress={handleClose}
          className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel="Close video"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-down" size={22} color="#fff" />
        </TouchableOpacity>
        
        {/* Title (optional) */}
        {showTitle && title && (
          <Text
            className="text-white text-sm font-medium ml-3 flex-1"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        )}
      </View>

      {/* Right side - Controls */}
      <View className="flex-row items-center gap-2">
        {onToggleSpeed && (
          <TouchableOpacity
            onPress={onToggleSpeed}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel="Playback speed"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-white text-xs font-bold">{playbackRate}x</Text>
          </TouchableOpacity>
        )}

        {onToggleLoop && (
          <TouchableOpacity
            onPress={onToggleLoop}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel="Toggle loop"
            accessibilityRole="button"
            accessibilityState={{ selected: isLooping }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name={isLooping ? 'loop' : 'trending-flat'} size={20} color={isLooping ? "#fff" : "#A1A1AA"} />
          </TouchableOpacity>
        )}

        {onPiP && (
          <TouchableOpacity
            onPress={onPiP}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel="Picture in picture"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="picture-in-picture-alt" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleMute}
          className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
          accessibilityRole="button"
          accessibilityState={{ selected: isMuted }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>

        {onRotateToPortrait && (
          <TouchableOpacity
            onPress={onRotateToPortrait}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel="Rotate orientation"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="screen-rotation" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleFullscreen}
          className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          accessibilityRole="button"
          accessibilityState={{ expanded: fullscreen }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={fullscreen ? 'contract' : 'expand'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default memo(TopControls);
