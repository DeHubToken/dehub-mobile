import React from 'react';
import { Animated, View, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
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
  videoRef: React.MutableRefObject<Video | null>;
};

const MiniPlayerOverlay: React.FC<Props> = ({ sourceUrl, transform, width, height, panHandlers, onExpand, onClose, isPlaying, isMuted, loop, onStatus, duration, position, videoRef }) => (
  <Animated.View style={{ position: 'absolute', width, height: height + 18, transform }} className="rounded-md overflow-hidden" {...panHandlers}>
    <Pressable onPress={onExpand} className="flex-1 bg-black">
      {sourceUrl && (
        <Video
          ref={r => (videoRef.current = r)}
          source={{ uri: sourceUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying}
          isMuted={isMuted}
          volume={1.0}
          isLooping={loop}
          onPlaybackStatusUpdate={onStatus}
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

export default MiniPlayerOverlay;
