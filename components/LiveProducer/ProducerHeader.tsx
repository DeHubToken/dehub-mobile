import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import {
  ChevronDown,
  Eye,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Zap,
} from "lucide-react-native";

type Stage =
  | "idle"
  | "creating"
  | "ready"
  | "starting"
  | "live"
  | "ending"
  | "ended";

interface ProducerHeaderProps {
  stage: Stage;
  startTimestamp: number | null;
  viewers: number;
  peakViewers: number;
  likes: number;
  bitrateKbps: number;
  micMuted: boolean;
  cameraOff: boolean;
  startingHint?: string;
  onRequestClose: () => void;
  onRequestEndConfirmation: () => void;
}

const formatDuration = (start: number | null): string => {
  if (!start) return "00:00";
  const diff = Date.now() - start;
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
};

const ProducerHeader: React.FC<ProducerHeaderProps> = ({
  stage,
  startTimestamp,
  viewers,
  peakViewers,
  likes,
  bitrateKbps,
  micMuted,
  cameraOff,
  startingHint,
  onRequestClose,
  onRequestEndConfirmation,
}) => {
  const insets = useSafeAreaInsets();
  const [, forceUpdate] = useState(0);

  const isLive = stage === "live";
  const isStarting = stage === "starting";
  const isEnding = stage === "ending";

  // Tick timer every second while live
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => forceUpdate((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // Pulsing dot animation
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    if (isLive) {
      pulseOpacity.value = withRepeat(
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [isLive, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const handlePressClose = useCallback(() => {
    if (isLive || isStarting || isEnding) {
      onRequestEndConfirmation();
    } else {
      onRequestClose();
    }
  }, [isLive, isStarting, isEnding, onRequestClose, onRequestEndConfirmation]);

  const statusLabel = isLive
    ? "LIVE"
    : isStarting
    ? "SETTING UP"
    : isEnding
    ? "ENDING"
    : stage === "ready"
    ? "READY"
    : "";

  const dotColor = isLive
    ? "#ef4444"
    : isStarting || isEnding
    ? "#f59e0b"
    : "#6b7280";

  return (
    <View
      className="px-4 pb-2"
      style={{ paddingTop: Math.max(insets.top + 4, 12) }}
      pointerEvents="box-none"
    >
      <View className="flex-row items-center" pointerEvents="box-none">
        <TouchableOpacity
          onPress={handlePressClose}
          activeOpacity={0.8}
          className="w-8 h-8 rounded-full items-center justify-center bg-black/40"
        >
          <ChevronDown color="#fff" size={18} />
        </TouchableOpacity>

        {statusLabel ? (
          <View className="flex-row items-center ml-3 bg-black/50 rounded-full px-3 py-1.5">
            <Animated.View
              style={[
                {
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: dotColor,
                  marginRight: 6,
                },
                isLive ? pulseStyle : {},
              ]}
            />
            <Text className="text-white font-bold text-[11px] tracking-wider">
              {statusLabel}
            </Text>
            {isLive && startTimestamp ? (
              <Text className="text-white/70 text-[11px] ml-2">
                {formatDuration(startTimestamp)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {isStarting && startingHint ? (
          <Text
            className="text-white/50 text-[10px] ml-2 flex-1"
            numberOfLines={1}
          >
            {startingHint}
          </Text>
        ) : (
          <View className="flex-1" />
        )}

        <View className="flex-row items-center gap-2">
          {cameraOff ? (
            <VideoOff color="#f87171" size={14} />
          ) : (
            <Video color="#a3e635" size={14} />
          )}
          {micMuted ? (
            <MicOff color="#f87171" size={14} />
          ) : (
            <Mic color="#a3e635" size={14} />
          )}
          {isLive ? (
            <View className="flex-row items-center ml-1 bg-black/40 rounded-full px-2.5 py-1">
              <Eye color="#94a3b8" size={12} />
              <Text className="text-white/80 text-[11px] ml-1 font-medium">
                {viewers}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {isLive ? (
        <View className="flex-row items-center mt-1 ml-12 gap-3">
          {peakViewers > 0 ? (
            <Text className="text-white/40 text-[10px]">
              Peak {peakViewers}
            </Text>
          ) : null}
          {likes > 0 ? (
            <Text className="text-white/40 text-[10px]">
              {likes} {likes === 1 ? "like" : "likes"}
            </Text>
          ) : null}
          {bitrateKbps > 0 ? (
            <View className="flex-row items-center gap-0.5">
              <Zap color="#fbbf24" size={10} />
              <Text className="text-white/40 text-[10px]">
                {bitrateKbps} kbps
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default memo(ProducerHeader);
