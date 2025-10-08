import React from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  isPlaying: boolean;
  isBuffering: boolean;
  onTogglePlay: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  hideSeekButtons?: boolean;
};

const CenterControls: React.FC<Props> = ({ isPlaying, isBuffering, onTogglePlay, onSeekBack, onSeekForward, hideSeekButtons }) => (
  <View className="items-center">
    <View className="flex-row items-center justify-center mb-4">
      {!hideSeekButtons && (
        <TouchableOpacity onPress={onSeekBack} className="bg-black/50 rounded-full px-3 py-3 mr-6 items-center" activeOpacity={0.7}>
          <Ionicons name="play-back" size={26} color="#fff" />
          <Text className="text-white text-[10px] mt-0.5">30s</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onTogglePlay} className="bg-black/60 rounded-full p-5 mx-2">
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#fff" />
      </TouchableOpacity>
      {!hideSeekButtons && (
        <TouchableOpacity onPress={onSeekForward} className="bg-black/50 rounded-full px-3 py-3 ml-6 items-center" activeOpacity={0.7}>
          <Ionicons name="play-forward" size={26} color="#fff" />
          <Text className="text-white text-[10px] mt-0.5">10s</Text>
        </TouchableOpacity>
      )}
    </View>
    {isBuffering && <ActivityIndicator color="#fff" />}
  </View>
);

export default CenterControls;
