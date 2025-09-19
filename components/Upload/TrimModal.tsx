import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import GlassModal from "../ui/GlassModal";
import { VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";

export type TrimModalProps = {
  visible: boolean;
  onClose: () => void;
  onCancel: () => void;
  onContinue: () => void;
  player: any;
  pendingAsset: { uri: string } | null;
  media: { duration?: number } | null;
  startSec: number;
  endSec: number;
  setTimelineWidth: (w: number) => void;
  generatingFrames: boolean;
  frameUris: string[];
  timelineWidth: number;
  toSeconds: (v?: number | null) => number | undefined;
  startPan: any;
  endPan: any;
  playheadX: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
};

const TrimModal: React.FC<TrimModalProps> = ({
  visible,
  onClose,
  onCancel,
  onContinue,
  player,
  pendingAsset,
  media,
  startSec,
  endSec,
  setTimelineWidth,
  generatingFrames,
  frameUris,
  timelineWidth,
  toSeconds,
  startPan,
  endPan,
  playheadX,
  isPlaying,
  onTogglePlay,
}) => {
  return (
    <GlassModal visible={visible} onClose={onClose} presentation="center" maxHeight="85%">
      <View className="p-4">
        <Text className="text-white mb-3 font-bold text-lg">Preview Video</Text>
        <View className="rounded-xl overflow-hidden border border-zinc-800">
          {pendingAsset ? (
            <VideoView
              player={player}
              style={{ width: "100%", height: 200, backgroundColor: "#111111" }}
              contentFit="contain"
              nativeControls={false}
            />
          ) : (
            <View className="h-40 bg-zinc-900" />)
          }
        </View>
        <View className="mt-4">
          <Text className="text-gray-400 mb-2">
            {startSec} - {endSec} • {Math.max(0, endSec - startSec)}
          </Text>
          <View className="h-16 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800" onLayout={(e) => setTimelineWidth(e.nativeEvent.layout.width)}>
            <View className="absolute inset-0 flex-row">
              {generatingFrames && frameUris.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : (
                frameUris.map((u, i) => <Image key={i} source={{ uri: u }} className="flex-1" resizeMode="cover" />)
              )}
            </View>
            <View
              style={{
                left: 0,
                width: timelineWidth * (startSec / Math.max(1, toSeconds(media?.duration) ?? endSec)),
              }}
              className="absolute top-0 bottom-0 bg-black/50"
            />
            <View
              style={{
                right: 0,
                width:
                  timelineWidth *
                  (Math.max(0, (toSeconds(media?.duration) ?? endSec) - endSec) /
                    Math.max(1, toSeconds(media?.duration) ?? endSec)),
              }}
              className="absolute top-0 bottom-0 bg-black/50"
            />
            <View
              style={{
                position: "absolute",
                left: timelineWidth * (startSec / Math.max(1, toSeconds(media?.duration) ?? endSec)),
                right:
                  timelineWidth *
                  (1 - endSec / Math.max(1, toSeconds(media?.duration) ?? endSec)),
                top: 0,
                bottom: 0,
              }}
              className="border-2 border-theme-accent"
            />
            <View
              {...startPan.panHandlers}
              style={{
                position: "absolute",
                left: timelineWidth * (startSec / Math.max(1, toSeconds(media?.duration) ?? endSec)) - 12,
                top: 0,
                bottom: 0,
                width: 24,
              }}
              className="bg-theme-accent"
            />
            <View
              {...endPan.panHandlers}
              style={{
                position: "absolute",
                left: timelineWidth * (endSec / Math.max(1, toSeconds(media?.duration) ?? endSec)) - 12,
                top: 0,
                bottom: 0,
                width: 24,
              }}
              className="bg-theme-accent"
            />
            <View style={{ position: "absolute", left: playheadX, top: 0, bottom: 0, width: 2, backgroundColor: "#FFFFFF" }} />
          </View>
        </View>
        <View className="mt-4 flex-row justify-between items-center">
          <TouchableOpacity onPress={onTogglePlay} className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} className="mr-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700">
            <Text className="text-white">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onContinue} className="px-3 py-2 rounded-lg bg-theme-accent">
            <Text className="text-white font-bold">Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default TrimModal;
