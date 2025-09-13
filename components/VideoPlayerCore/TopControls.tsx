import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  onClose: () => void;
  onMute: () => void;
  onFullscreen: () => void;
  isMuted: boolean;
  fullscreen: boolean;
};

const TopControls: React.FC<Props> = ({ onClose, onMute, onFullscreen, isMuted, fullscreen }) => (
  <View className="flex-row justify-between items-center">
    <TouchableOpacity onPress={onClose} className="bg-black/50 rounded-full p-2 mr-2" activeOpacity={0.7}>
      <Ionicons name="chevron-down" size={20} color="#fff" />
    </TouchableOpacity>
    <View className="flex-row items-center">
      <TouchableOpacity onPress={onMute} className="bg-black/50 rounded-full p-2 mr-2">
        <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onFullscreen} className="bg-black/50 rounded-full p-2">
        <Ionicons name={fullscreen ? 'contract' : 'expand'} size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  </View>
);

export default TopControls;
