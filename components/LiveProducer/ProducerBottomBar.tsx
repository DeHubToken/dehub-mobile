import React, { memo, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Radio,
  Video,
  VideoOff,
  Mic,
  MicOff,
  RefreshCw,
  Server,
} from "lucide-react-native";

type Stage =
  | "idle"
  | "creating"
  | "ready"
  | "starting"
  | "live"
  | "ending"
  | "ended";

interface ProducerBottomBarProps {
  stage: Stage;
  onStart: () => void;
  onEnd: () => void;
  micMuted: boolean;
  cameraOff: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  externalMode: boolean;
  onToggleExternal: () => void;
  startDisabled?: boolean;
}

const CIRCLE = "w-12 h-12 rounded-xl items-center justify-center";

const ProducerBottomBar: React.FC<ProducerBottomBarProps> = ({
  stage,
  onStart,
  onEnd,
  micMuted,
  cameraOff,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  externalMode,
  onToggleExternal,
  startDisabled,
}) => {
  const isLive = stage === "live";
  const isStarting = stage === "starting";
  const isEnding = stage === "ending";
  const isReady = stage === "ready";
  const canStart = isReady && !isStarting && !startDisabled;
  const canEnd = isLive && !isEnding;
  const hideExternalToggle =
    isStarting || isLive || isEnding || stage === "ended";

  const handleStart = useCallback(() => {
    if (canStart) onStart();
  }, [canStart, onStart]);

  const handleEnd = useCallback(() => {
    if (canEnd) onEnd();
  }, [canEnd, onEnd]);

  return (
    <View className="px-4 pb-2" pointerEvents="box-none">
      {/* Controls row: Flip, Mic, Camera, External */}
      <View className="flex-row items-center justify-center gap-4 mb-3">
        <TouchableOpacity
          onPress={onFlipCamera}
          activeOpacity={0.8}
          className={`${CIRCLE} bg-zinc-900/60`}
          accessibilityRole="button"
          accessibilityLabel="Flip camera"
        >
          <RefreshCw color="#fff" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onToggleMic}
          activeOpacity={0.8}
          className={`${CIRCLE} ${
            micMuted ? "bg-white/20" : "bg-zinc-900/60"
          }`}
          accessibilityRole="button"
          accessibilityLabel={micMuted ? "Unmute microphone" : "Mute microphone"}
          accessibilityState={{ selected: micMuted }}
        >
          {micMuted ? (
            <MicOff color="#fff" size={20} />
          ) : (
            <Mic color="#fff" size={20} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onToggleCamera}
          activeOpacity={0.8}
          className={`${CIRCLE} ${
            cameraOff ? "bg-white/20" : "bg-zinc-900/60"
          }`}
          accessibilityRole="button"
          accessibilityLabel={cameraOff ? "Turn camera on" : "Turn camera off"}
          accessibilityState={{ selected: cameraOff }}
        >
          {cameraOff ? (
            <VideoOff color="#fff" size={20} />
          ) : (
            <Video color="#fff" size={20} />
          )}
        </TouchableOpacity>

        {/* External mode toggle (only pre-stream) */}
        {!hideExternalToggle ? (
          <TouchableOpacity
            onPress={onToggleExternal}
            activeOpacity={0.8}
            className={`${CIRCLE} ${
              externalMode ? "bg-white/20" : "bg-zinc-900/60"
            }`}
            accessibilityRole="button"
            accessibilityLabel="External streaming mode"
            accessibilityState={{ selected: externalMode }}
          >
            <Server color="#fff" size={18} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Main action: Go Live / End Stream */}
      {isLive || isEnding ? (
        <TouchableOpacity
          onPress={handleEnd}
          activeOpacity={0.9}
          className={`self-center flex-row items-center px-8 h-12 rounded-xl ${
            canEnd ? "bg-zinc-900/60 border border-white/20" : "bg-zinc-900/40 border border-white/10 opacity-60"
          }`}
        >
          <Radio color="#fff" size={18} />
          <Text className="text-white font-bold text-sm ml-2">
            {isEnding ? "Ending..." : "End Stream"}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handleStart}
          activeOpacity={canStart ? 0.9 : 1}
          className={`self-center flex-row items-center px-8 h-12 rounded-xl ${
            canStart ? "bg-white" : "bg-white/20"
          }`}
        >
          <Radio color={canStart ? "#09090B" : "rgba(255,255,255,0.5)"} size={18} />
          <Text
            className={`font-bold text-sm ml-2 ${
              canStart ? "text-zinc-950" : "text-white/50"
            }`}
          >
            {isStarting
              ? "Setting Up..."
              : startDisabled
              ? "Preparing..."
              : externalMode
              ? "Start External"
              : "Go Live"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default memo(ProducerBottomBar);
