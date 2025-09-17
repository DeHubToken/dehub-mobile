import React, { useEffect } from 'react';
import { Animated, View, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  sourceUrl: string | null;
  transform: any;
  width: number;
  height: number;
  panHandlers: any;
  onExpand: () => void;
  onClose: () => void;
  isPlaying: boolean;
  isMuted: boolean;
  loop: boolean;
  onStatus: (s: any) => void;
  duration: number;
  position: number;
  videoRef: React.MutableRefObject<VideoView | null>;
};

const MiniPlayerOverlay: React.FC<Props> = ({ sourceUrl, transform, width, height, panHandlers, onExpand, onClose, isPlaying, isMuted, loop, onStatus: _onStatusUnused, duration, position, videoRef }) => {
  const player = useVideoPlayer(sourceUrl ?? null, p => {
    p.loop = loop;
    p.muted = isMuted;
    if (isPlaying) p.play(); else p.pause();
  });

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (isPlaying) player.play(); else player.pause();
  }, [isPlaying, player]);

  return (
    <Animated.View style={{ position: 'absolute', width, height: height + 18, transform }} className="rounded-md overflow-hidden" {...panHandlers}>
      <Pressable onPress={onExpand} className="flex-1 bg-black">
        {sourceUrl && (
          <VideoView
            ref={(r) => {
              videoRef.current = r as any;
            }}
            player={player}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            nativeControls={false}
          />
        )}
        {!sourceUrl && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#fff" />
          </View>
        )}
        <TouchableOpacity onPress={onClose} className="absolute top-1 right-1 bg-black/60 rounded-full w-6 h-6 items-center justify-center" hitSlop={10}>
          <Ionicons name="close" size={14} color="#fff" />
        </TouchableOpacity>
        <View className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <View style={{ width: `${duration ? (position / duration) * 100 : 0}%` }} className="h-full bg-theme-accent" />
        </View>
      </Pressable>
    </Animated.View>
  );
};

export default MiniPlayerOverlay;
