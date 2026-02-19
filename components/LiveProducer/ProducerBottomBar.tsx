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

const CIRCLE = "w-12 h-12 rounded-full items-center justify-center";

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
          className={`${CIRCLE} bg-black/40 border border-white/10`}
        >
          <RefreshCw color="#fff" size={20} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onToggleMic}
          activeOpacity={0.8}
          className={`${CIRCLE} border border-white/10 ${
            micMuted ? "bg-red-600/40" : "bg-black/40"
          }`}
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
          className={`${CIRCLE} border border-white/10 ${
            cameraOff ? "bg-red-600/40" : "bg-black/40"
          }`}
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
            className={`${CIRCLE} border border-white/10 ${
              externalMode ? "bg-indigo-600" : "bg-black/40"
            }`}
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
          className={`self-center flex-row items-center px-8 h-12 rounded-full ${
            canEnd ? "bg-red-600" : "bg-red-800/70"
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
          className={`self-center flex-row items-center px-8 h-12 rounded-full ${
            !canStart
              ? "bg-zinc-700/70"
              : externalMode
              ? "bg-indigo-600"
              : "bg-green-600"
          }`}
        >
          <Radio color="#fff" size={18} />
          <Text className="text-white font-bold text-sm ml-2">
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
