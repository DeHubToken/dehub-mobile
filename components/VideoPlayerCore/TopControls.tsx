import React, { memo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, Text, AccessibilityInfo } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from "../ui/Icon";

interface TopControlsProps {
  onClose: () => void;
  onMute: () => void;
  onVolumeHold?: () => void;
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
  onVolumeHold,
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
  const { t } = useTranslation();
  const volumeHeld = useRef(false);
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleMute = useCallback(() => {
    onMute();
    AccessibilityInfo.announceForAccessibility(
      isMuted ? t('player.soundOn') : t('player.soundMuted')
    );
  }, [onMute, isMuted, t]);

  const handleFullscreen = useCallback(() => {
    onFullscreen();
    AccessibilityInfo.announceForAccessibility(
      fullscreen ? t('player.exitingFullscreen') : t('player.enteringFullscreen')
    );
  }, [onFullscreen, fullscreen, t]);

  return (
    <View className="flex-row justify-between items-center">
      {/* Left side - Close button */}
      <View className="flex-row items-center flex-1">
        <TouchableOpacity
          onPress={handleClose}
          className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={t('player.closeVideo')}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name="ChevronRight" size={22} color="#fff" /></View>
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
            accessibilityLabel={t('player.playbackSpeed')}
            accessibilityRole="button"
            hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
          >
            <Text className="text-white text-xs font-bold">{playbackRate}x</Text>
          </TouchableOpacity>
        )}

        {onToggleLoop && (
          <TouchableOpacity
            onPress={onToggleLoop}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={t('player.toggleLoop')}
            accessibilityRole="button"
            accessibilityState={{ selected: isLooping }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="Repeat" size={20} color={isLooping ? "#fff" : "#A1A1AA"} />
          </TouchableOpacity>
        )}

        {onPiP && (
          <TouchableOpacity
            onPress={onPiP}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={t('player.pictureInPicture')}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="PictureInPicture2" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleMute}
          delayLongPress={220}
          onLongPress={onVolumeHold ? () => { volumeHeld.current = true; } : undefined}
          onPressOut={() => {
            if (volumeHeld.current) { volumeHeld.current = false; onVolumeHold?.(); }
          }}
          accessibilityActions={onVolumeHold ? [{ name: 'longpress', label: t('dub.audio') }] : undefined}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onVolumeHold?.(); }}
          className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={isMuted ? t('common.unmute') : t('common.mute')}
          accessibilityRole="button"
          accessibilityState={{ selected: isMuted }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon
            name={isMuted ? 'VolumeX' : 'Volume2'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>

        {onRotateToPortrait && (
          <TouchableOpacity
            onPress={onRotateToPortrait}
            className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
            accessibilityLabel={t('player.rotateOrientation')}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="RefreshCw" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleFullscreen}
          className="bg-zinc-900/60 rounded-xl w-10 h-10 items-center justify-center"
          activeOpacity={0.7}
          accessibilityLabel={fullscreen ? t('common.exitFullscreen') : t('player.enterFullscreen')}
          accessibilityRole="button"
          accessibilityState={{ expanded: fullscreen }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon
            name={fullscreen ? 'Minimize' : 'Maximize'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default memo(TopControls);
