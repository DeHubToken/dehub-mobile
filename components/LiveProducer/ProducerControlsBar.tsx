import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageSquare, Radio, Video, VideoOff, Mic, MicOff, Repeat2, Server, MessageCircleOff } from 'lucide-react-native';

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
  chatEnabled?: boolean;
  onToggleChatEnabled?: () => void;
}

/**
 * The secondary controls float on the picture with nothing behind them.
 *
 * They used to each carry a `bg-black/40 border border-white/10` pill, which
 * over a moving camera reads as a row of boxes sitting on the shot rather than
 * controls belonging to it. Legibility comes from the scrim below instead — one
 * gradient across the foot of the screen, which is what keeps white icons
 * readable over a bright frame without giving any of them a box of their own.
 *
* Go Live and End keep a fill: they are the actions that must never be missed. * They are told apart by weight rather than by hue — Go Live is the one solid * white control on the frame, End is glass — because the design system keeps * colour off these surfaces, and the two never appear at the same time. */
const circleBtn = 'w-12 h-12 rounded-xl items-center justify-center';
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
  chatEnabled,
  onToggleChatEnabled,
}) => {
  const isLive = stage === 'live';
  const isStarting = stage === 'starting';
  const isEnding = stage === 'ending';
  const isReady = stage === 'ready';
  const canStart = isReady && !isStarting && !startDisabled;
  const canEnd = isLive && !isEnding;

  const hideExternalToggle = isStarting || isLive || isEnding || stage === 'ended';

  return (
    <View className="absolute bottom-0 left-0 right-0">
      {/* The scrim that replaces every button's pill. Transparent at the top so
          it never reads as a bar, opaque enough at the foot to hold white icons
          against a bright frame. pointerEvents none — it must not eat taps. */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: -32 }}
        pointerEvents="none"
      />
      <View className="p-4 pb-6">
      <View className="flex-row items-center mb-3">
        <TouchableOpacity
          onPress={onToggleChat}
          activeOpacity={tap}
          className={`mr-2 ${circleBtn} relative ${chatVisible ? 'bg-white/20' : ''}`}
        >
          <MessageSquare color="white" size={22} />
          {!chatVisible && hasUnseenChats && (
            <View className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-white border border-black" />
          )}
        </TouchableOpacity>
        <View className="flex-1" />
        {!hideExternalToggle && (
          <TouchableOpacity
            onPress={onToggleExternal}
            activeOpacity={tap}
            className={`mr-2 ${circleBtn} ${externalMode ? 'bg-white/20' : ''}`}
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
            className={`px-6 h-12 rounded-xl items-center justify-center flex-row border border-white/20 ${canEnd ? 'bg-zinc-900/60' : 'bg-zinc-900/40 opacity-60'}`}
          >
            <Radio color="white" size={20} className="mr-2" />
            <Text className="text-white font-semibold text-sm">{isEnding ? 'Ending…' : 'End'}</Text>
          </TouchableOpacity>
        ) : (
            <TouchableOpacity
              onPress={!canStart ? undefined : onStart}
              activeOpacity={!canStart ? 1 : 0.9}
              className={`px-6 h-12 rounded-xl items-center justify-center flex-row ${!canStart ? 'bg-white/20' : 'bg-white'}`}
            >
              <Radio color={!canStart ? 'rgba(255,255,255,0.5)' : '#09090B'} size={20} className="mr-2" />
              <Text className={`font-semibold text-sm ${!canStart ? 'text-white/50' : 'text-zinc-950'}`}>{isStarting ? 'Setting Up…' : startDisabled ? 'Preparing…' : externalMode ? 'Start External' : 'Go Live'}</Text>
            </TouchableOpacity>
        )}
      </View>
      <View className="flex-row items-center">
        <TouchableOpacity
          onPress={onFlipCamera}
          activeOpacity={tap}
          className={`${circleBtn} mr-3`}
        >
          <Repeat2 color="white" size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleMic}
          activeOpacity={tap}
          className={`${circleBtn} mr-3`}
        >
          {micMuted ? <MicOff color="white" size={20} /> : <Mic color="white" size={20} />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleCamera}
          activeOpacity={tap}
          className={`${circleBtn} mr-3`}
        >
          {cameraOff ? <VideoOff color="white" size={20} /> : <Video color="white" size={20} />}
        </TouchableOpacity>
        {isLive && onToggleChatEnabled && (
          /* Chat-off keeps a fill: it is a state the host has put the room in,
             not a control at rest, and it has to read as switched off. */
          <TouchableOpacity
            onPress={onToggleChatEnabled}
            activeOpacity={tap}
            className={`${circleBtn} mr-3 ${chatEnabled ? '' : 'bg-white/20'}`}
          >
            {chatEnabled ? <MessageSquare color="white" size={18} /> : <MessageCircleOff color="white" size={18} />}
          </TouchableOpacity>
        )}
        <View className="flex-1" />
      </View>
      </View>
    </View>
  );
};

export default ProducerControlsBar;
