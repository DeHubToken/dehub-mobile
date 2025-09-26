import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useLive } from "../hooks/use-live";

type RouteParams = {
  streamId?: string;
  tokenId?: number;
  ingestUrl?: string;
  streamKey?: string;
};

const LiveProducerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { streamId, tokenId, ingestUrl, streamKey } = (route.params || {}) as RouteParams;
  const { stage, start, end } = useLive();

  const onStart = useCallback(() => {
    start().catch(() => {});
  }, [start]);

  const onEnd = useCallback(() => {
    end().catch(() => {});
  }, [end]);

  return (
    <View className="flex-1 bg-black">
      {/* TODO: Replace with in-app camera preview/encoder */}
      <View className="flex-1 items-center justify-center">
        <Text className="text-white text-lg mb-2">Live Producer</Text>
        <Text className="text-zinc-400 text-xs">streamId: {streamId || "-"}  tokenId: {tokenId ?? '-'}</Text>
        {ingestUrl && (
          <Text className="text-zinc-500 text-[10px] mt-1" numberOfLines={1}>Ingest: {ingestUrl}</Text>
        )}
        {streamKey && (
          <Text className="text-zinc-500 text-[10px]" numberOfLines={1}>Key: {streamKey}</Text>
        )}
        <View className="h-48 w-80 mt-4 rounded-xl bg-zinc-900 border border-zinc-800 items-center justify-center">
          <Text className="text-zinc-500">Camera Preview</Text>
        </View>
      </View>
      <View className="px-4 py-4 border-t border-white/10">
        <View className="flex-row">
          {stage === "live" ? (
            <TouchableOpacity className="flex-1 h-12 bg-red-600 rounded-xl items-center justify-center mr-3" onPress={onEnd}>
              <Text className="text-white font-semibold">End Live</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity className="flex-1 h-12 bg-green-600 rounded-xl items-center justify-center mr-3" onPress={onStart}>
              <Text className="text-white font-semibold">Go Live</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity className="w-12 h-12 bg-white/10 rounded-xl items-center justify-center" onPress={navigation.goBack}>
            <Text className="text-white">X</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default LiveProducerScreen;
