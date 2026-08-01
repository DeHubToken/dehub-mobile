import React from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { secondsToHMMSS } from "../../libs/date.util";
import { formatBytes } from "../../libs";

export type UploadAssetsSectionProps = {
  media: { uri: string; duration?: number; width?: number; height?: number } | null;
  thumbUri: string | null;
  fileSize: number | null;
  coverUri: string | null;
  onPickVideo: () => void;
  onClearVideo: () => void;
  onPickCover: () => void;
  toSeconds: (v?: number | null) => number | undefined;
};

const UploadAssetsSection: React.FC<UploadAssetsSectionProps> = ({
  media,
  thumbUri,
  fileSize,
  coverUri,
  onPickVideo,
  onClearVideo,
  onPickCover,
  toSeconds,
}) => {
  if (!media) {
    return (
      <TouchableOpacity
        onPress={onPickVideo}
        activeOpacity={0.9}
        className="h-28 rounded-xl border border-zinc-800 bg-zinc-900 items-center justify-center"
      >
        <View className="flex-row items-center">
          <Ionicons name="videocam-outline" size={20} color="#9CA3AF" />
          <Text className="ml-2 text-gray-300 font-semibold">Pick a video</Text>
        </View>
        <Text className="text-gray-500 mt-1 text-xs">Tap to open your library</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <Text className="text-gray-400 mb-1">
        Assets <Text className="text-red-500">*</Text>
      </Text>
      <View className="mt-2 rounded-xl overflow-hidden border border-zinc-800">
        <View className="relative">
          {thumbUri ? (
            <Image source={{ uri: thumbUri }} className="w-full h-48" resizeMode="cover" />
          ) : (
            <View className="w-full h-48 bg-zinc-900 items-center justify-center">
              <ActivityIndicator color="#F4F4F5" />
            </View>
          )}
          <View className="absolute top-2 right-2 flex-row">
            <TouchableOpacity
              onPress={onPickVideo}
              className="w-9 h-9 rounded-full items-center justify-center bg-black/60 border border-zinc-700 mr-2"
              accessibilityLabel="Change video"
            >
              <Ionicons name="pencil" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClearVideo}
              className="w-9 h-9 rounded-full items-center justify-center bg-black/60 border border-zinc-700"
              accessibilityLabel="Remove video"
            >
              <Ionicons name="trash" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
        <View className="p-3 bg-zinc-900 border-t border-zinc-800">
          <Text className="text-white text-sm">
            Duration: {secondsToHMMSS(toSeconds(media?.duration ?? undefined)) ?? "0:00"}
          </Text>
          <Text className="text-gray-400 text-xs mt-1">
            {media.width && media.height ? `${media.width}x${media.height}` : ""}
            {fileSize ? ` • ${formatBytes(fileSize)}` : ""}
          </Text>
          <View className="mt-3 flex-row">
            <TouchableOpacity disabled className="mr-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40 opacity-50">
              <Text className="text-gray-400">Trim</Text>
            </TouchableOpacity>
          </View>
          {media && (
            <View className="mt-4 rounded-xl overflow-hidden border border-zinc-800">
              <View className="p-3 bg-zinc-900 border-b border-zinc-800">
                <Text className="text-white font-semibold">Cover Image</Text>
                <Text className="text-gray-400 text-xs mt-1">Shown as the video thumbnail/cover.</Text>
              </View>
              <View className="relative">
                {coverUri || thumbUri ? (
                  <Image source={{ uri: (coverUri ?? thumbUri)! }} className="w-full h-40" resizeMode="cover" />
                ) : (
                  <View className="w-full h-40 bg-zinc-900 items-center justify-center">
                    <ActivityIndicator color="#F4F4F5" />
                  </View>
                )}
                <View className="absolute top-2 right-2 flex-row">
                  <TouchableOpacity
                    onPress={onPickCover}
                    className="w-9 h-9 rounded-full items-center justify-center bg-black/60 border border-zinc-700 mr-2"
                    accessibilityLabel="Change cover image"
                  >
                    <Ionicons name="pencil" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  {coverUri && (
                    <TouchableOpacity
                      onPress={() => onPickCover()}
                      className="w-9 h-9 rounded-full items-center justify-center bg-black/60 border border-zinc-700"
                      accessibilityLabel="Remove custom cover"
                    >
                      <Ionicons name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </>
  );
};

export default UploadAssetsSection;
