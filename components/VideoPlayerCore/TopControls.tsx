import React, { memo, useCallback } from 'react';
import { View, TouchableOpacity, Text, AccessibilityInfo } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface TopControlsProps {
  onClose: () => void;
  onMute: () => void;
  onFullscreen: () => void;
  onRotateToPortrait?: () => void;
  isMuted: boolean;
  fullscreen: boolean;
  title?: string;
  showTitle?: boolean;
}

const TopControls: React.FC<TopControlsProps> = ({
  onClose,
  onMute,
  onFullscreen,
  onRotateToPortrait,
  isMuted,
  fullscreen,
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
          className="bg-black/60 rounded-full p-2.5"
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
        <TouchableOpacity
          onPress={handleMute}
          className="bg-black/60 rounded-full p-2.5"
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

        {fullscreen && onRotateToPortrait && (
          <TouchableOpacity
            onPress={onRotateToPortrait}
            className="bg-black/60 rounded-full p-2.5"
            activeOpacity={0.7}
            accessibilityLabel="Rotate to portrait"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="screen-rotation" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleFullscreen}
          className="bg-black/60 rounded-full p-2.5"
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
