import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

interface Props {
  stage: 'idle' | 'creating' | 'ready' | 'starting' | 'live' | 'ending' | 'ended';
  startTimestamp?: number | null;
  bitrateKbps?: number;
  viewers?: number;
  likes?: number;
  onRequestClose?: () => void; // attempt to close screen
  onRequestEndConfirmation?: () => void; // open end stream confirmation when not allowed to close
}

const formatDuration = (start?: number | null) => {
  if (!start) return '00:00:00';
  const diff = Date.now() - start;
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const ProducerStatusBar: React.FC<Props> = ({ stage, startTimestamp, bitrateKbps = 3200, viewers = 0, likes = 0, onRequestClose, onRequestEndConfirmation }) => {
  const [, force] = useState(0);
  useEffect(() => {
    if (stage !== 'live') return;
    const id = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const isLive = stage === 'live';
  const isStarting = stage === 'starting';
  const isEnding = stage === 'ending';
  const isReady = stage === 'ready';
  const statusLabel = isLive ? 'LIVE' : isStarting ? 'SETTING UP' : isEnding ? 'ENDING' : isReady ? 'READY' : '—';

  const handlePressClose = () => {
    if (isLive || isStarting || isEnding) {
      onRequestEndConfirmation?.();
    } else {
      onRequestClose?.();
    }
  };

  return (
    <View className="absolute top-4 left-4 right-4 z-20 flex-row items-center justify-between bg-black/45 rounded-2xl pl-2 pr-3 py-2 border border-white/10">
      <View className="flex-row items-center flex-1">
        <TouchableOpacity
          onPress={handlePressClose}
          activeOpacity={0.8}
          className="w-8 h-8 rounded-full items-center justify-center mr-1 bg-white/5"
        >
          <ChevronDown color="#fff" size={20} />
        </TouchableOpacity>
        <View className="w-2 h-2 rounded-full mx-2" style={{ backgroundColor: isLive ? '#ef4444' : isStarting ? '#f59e0b' : isEnding ? '#f59e0b' : '#6b7280' }} />
        <Text className="text-white font-semibold text-xs mr-3">{statusLabel}</Text>
        {isLive && (
          <Text className="text-white/70 text-xs mr-3">{formatDuration(startTimestamp)}</Text>
        )}
        <Text className="text-white/70 text-xs mr-3">{bitrateKbps} kbps</Text>
        <Text className="text-white/70 text-xs mr-3" numberOfLines={1}>{viewers} watching</Text>
        <Text className="text-white/70 text-xs" numberOfLines={1}>{likes} likes</Text>
      </View>
      <View className="flex-row items-center" />
    </View>
  );
};

export default ProducerStatusBar;
