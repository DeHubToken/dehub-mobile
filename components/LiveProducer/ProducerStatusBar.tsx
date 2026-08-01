import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronDown, Video, VideoOff, Mic, MicOff, Eye, Heart, Zap } from 'lucide-react-native';

interface Props {
  stage: 'idle' | 'creating' | 'ready' | 'starting' | 'live' | 'ending' | 'ended';
  startTimestamp?: number | null;
  bitrateKbps?: number;
  viewers?: number;
  peakViewers?: number;
  likes?: number;
  micMuted?: boolean;
  cameraOff?: boolean;
  startingHint?: string;
  onRequestClose?: () => void;
  onRequestEndConfirmation?: () => void;
}

const formatDuration = (start?: number | null) => {
  if (!start) return '00:00';
  const diff = Date.now() - start;
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, marginRight: 5 }} />
);

const ProducerStatusBar: React.FC<Props> = ({
  stage,
  startTimestamp,
  bitrateKbps,
  viewers = 0,
  peakViewers = 0,
  likes = 0,
  micMuted,
  cameraOff,
  startingHint,
  onRequestClose,
  onRequestEndConfirmation,
}) => {
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

  const dotColor = isLive ? '#ef4444' : isStarting || isEnding ? '#D4D4D8' : '#6b7280';
  const statusLabel = isLive ? 'LIVE' : isStarting ? 'SETTING UP' : isEnding ? 'ENDING' : isReady ? 'READY' : '—';

  const handlePressClose = () => {
    if (isLive || isStarting || isEnding) {
      onRequestEndConfirmation?.();
    } else {
      onRequestClose?.();
    }
  };

  return (
    <View
      className="absolute top-4 left-4 right-4 z-20 bg-black/50 rounded-xl border border-white/10"
      style={{ paddingHorizontal: 10, paddingVertical: 8 }}
    >
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={handlePressClose}
          activeOpacity={0.8}
          className="w-7 h-7 rounded-full items-center justify-center bg-white/5 mr-2"
        >
          <ChevronDown color="#fff" size={18} />
        </TouchableOpacity>

        <Dot color={dotColor} />
        <Text className="text-white font-bold text-xs mr-3">{statusLabel}</Text>

        {isLive && (
          <Text className="text-white/70 text-xs mr-3">{formatDuration(startTimestamp)}</Text>
        )}
        {isStarting && startingHint ? (
          <Text className="text-white/60 text-xs flex-1" numberOfLines={1}>{startingHint}</Text>
        ) : (
          <View className="flex-1" />
        )}

        <View className="flex-row items-center gap-2 ml-2">
          {cameraOff ? <VideoOff color="#f87171" size={13} /> : <Video color="#a3e635" size={13} />}
          {micMuted ? <MicOff color="#f87171" size={13} /> : <Mic color="#a3e635" size={13} />}
        </View>
      </View>

      {isLive && (
        <View className="flex-row items-center mt-1.5 ml-9 gap-3">
          <View className="flex-row items-center gap-1">
            <Eye color="#94a3b8" size={11} />
            <Text className="text-white/70 text-[11px]">{viewers}</Text>
          </View>
          {peakViewers > 0 && (
            <Text className="text-white/40 text-[11px]">Peak {peakViewers}</Text>
          )}
          <View className="flex-row items-center gap-1">
            <Heart color="#f87171" size={11} />
            <Text className="text-white/70 text-[11px]">{likes}</Text>
          </View>
          {typeof bitrateKbps === 'number' && bitrateKbps > 0 && (
            <View className="flex-row items-center gap-1">
              <Zap color="#D4D4D8" size={11} />
              <Text className="text-white/50 text-[11px]">{bitrateKbps} kbps</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default ProducerStatusBar;
