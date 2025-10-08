import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MessageSquare, Gift, Radio, Video, VideoOff, Mic, MicOff, Repeat2, Server } from 'lucide-react-native';

interface Props {
  stage: 'idle' | 'creating' | 'ready' | 'starting' | 'live' | 'ending' | 'ended';
  onStart: () => void;
  onEnd: () => void;
  onToggleChat: () => void;
  chatVisible: boolean;
  hasUnseenChats: boolean;
  micMuted: boolean;
  cameraOff: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  externalMode: boolean;
  onToggleExternal: () => void;
  startDisabled?: boolean; // externally enforced preconditions (e.g. missing streamKey/livepeerId)
}

const circleBtn = 'w-12 h-12 rounded-full items-center justify-center';
const tap = 0.85;

const ProducerControlsBar: React.FC<Props> = ({
  stage,
  onStart,
  onEnd,
  onToggleChat,
  chatVisible,
  hasUnseenChats,
  micMuted,
  cameraOff,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  externalMode,
  onToggleExternal,
  startDisabled,
}) => {
  const isLive = stage === 'live';
  const isStarting = stage === 'starting';
  const isEnding = stage === 'ending';
  const isReady = stage === 'ready';
  const canStart = isReady && !isStarting && !startDisabled;
  const canEnd = isLive && !isEnding;

  const hideExternalToggle = isStarting || isLive || isEnding || stage === 'ended';

  return (
    <View className="absolute bottom-0 left-0 right-0 p-4 pb-6">
      <View className="flex-row items-center mb-3">
        <TouchableOpacity
          onPress={onToggleChat}
          activeOpacity={tap}
          className={`mr-2 ${circleBtn} bg-black/40 border border-white/10 relative ${chatVisible ? 'bg-white/20' : ''}`}
        >
          <MessageSquare color="white" size={22} />
          {!chatVisible && hasUnseenChats && (
            <View className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border border-black" />
          )}
        </TouchableOpacity>
        {/* <TouchableOpacity
          onPress={onOpenGifts}
          activeOpacity={tap}
          className={`mr-2 ${circleBtn} bg-black/40 border border-white/10`}
        >
          <Gift color="white" size={22} />
        </TouchableOpacity> */}
        <View className="flex-1" />
        {/* External stream toggle (hidden once starting/live/ending/ended) */}
        {!hideExternalToggle && (
          <TouchableOpacity
            onPress={onToggleExternal}
            activeOpacity={tap}
            className={`mr-2 ${circleBtn} border border-white/10 ${externalMode ? 'bg-indigo-600' : 'bg-black/40'}`}
          >
            <Server color="white" size={20} />
            {!externalMode && (
              <View className="absolute -bottom-1.5">
                <Text className="text-[9px] text-white/60">EXT</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        {isLive ? (
          <TouchableOpacity
            onPress={canEnd ? onEnd : undefined}
            activeOpacity={0.9}
            className={`px-6 h-12 rounded-full items-center justify-center flex-row ${canEnd ? 'bg-red-600' : 'bg-red-800/70'}`}
          >
            <Radio color="white" size={20} className="mr-2" />
            <Text className="text-white font-semibold text-sm">{isEnding ? 'Ending…' : 'End'}</Text>
          </TouchableOpacity>
        ) : (
            <TouchableOpacity
              onPress={externalMode || !canStart ? undefined : onStart}
              activeOpacity={externalMode || !canStart ? 1 : 0.9}
              className={`px-6 h-12 rounded-full items-center justify-center flex-row ${externalMode || !canStart ? 'bg-zinc-700/70' : 'bg-green-600'}`}
            >
              <Radio color="white" size={20} className="mr-2" />
              <Text className="text-white font-semibold text-sm">{isStarting ? 'Setting Up…' : startDisabled ? 'Preparing…' : 'Go Live'}</Text>
            </TouchableOpacity>
        )}
      </View>
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={onFlipCamera}
          activeOpacity={tap}
          className={`${circleBtn} bg-black/40 border border-white/10 mr-3`}
        >
          <Repeat2 color="white" size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleMic}
          activeOpacity={tap}
          className={`${circleBtn} bg-black/40 border border-white/10 mr-3`}
        >
          {micMuted ? <MicOff color="white" size={20} /> : <Mic color="white" size={20} />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleCamera}
          activeOpacity={tap}
          className={`${circleBtn} bg-black/40 border border-white/10 mr-3`}
        >
          {cameraOff ? <VideoOff color="white" size={20} /> : <Video color="white" size={20} />}
        </TouchableOpacity>
        <View className="flex-1" />
      </View>
    </View>
  );
};

export default ProducerControlsBar;
