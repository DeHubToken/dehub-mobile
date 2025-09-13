import React from 'react';
import { View, Text } from 'react-native';

interface LiveStreamPlayerProps {
  tokenId?: string | number;
  streamKey?: string;
}

const LiveStreamPlayer: React.FC<LiveStreamPlayerProps> = ({ tokenId, streamKey }) => {
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="text-theme-neutrals-100 mb-2">Live Stream Player</Text>
      <Text className="text-theme-neutrals-400 text-xs">tokenId: {tokenId || 'N/A'}</Text>
      <Text className="text-theme-neutrals-500 text-[10px] mt-1">streamKey: {streamKey || 'N/A'}</Text>
    </View>
  );
};

export default LiveStreamPlayer;
