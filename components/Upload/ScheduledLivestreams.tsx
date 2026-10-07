import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { getUserScheduledLives, getLiveStream, getStreamKey, getIngestUrl, type ScheduledLiveItem } from "../../services/live.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import { toastError } from "../../libs/toast";

export default function ScheduledLivestreams({ address }: { address: string }) {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const [starting, setStarting] = useState<string | null>(null);
  const { data: streams = [] } = useQuery({ queryKey: ["composer-scheduled-streams", address], queryFn: () => getUserScheduledLives(address), enabled: !!address, staleTime: 0, retry: false });
  if (!streams.length) return null;

  const start = async (item: ScheduledLiveItem) => {
    if (starting) return;
    setStarting(item.streamId);
    try {
      const [response, key, ingest] = await Promise.all([getLiveStream(item.streamId), getStreamKey(item.streamId), getIngestUrl(item.streamId)]);
      const stream = "result" in response ? response.result : response;
      if (!stream || stream.tokenId == null || !key.streamKey) throw new Error("Missing stream credentials");
      nav.navigate(ScreenNames.LiveProducer, { streamId: item.streamId, tokenId: stream.tokenId, streamKey: key.streamKey, ingestUrl: ingest.ingestUrl, discardIfNeverLive: false });
    } catch {
      toastError(t("stages.startFailed"));
    } finally { setStarting(null); }
  };

  return (
    <View className="mt-3 rounded-xl border border-white/20 p-3">
      <Text className="text-white/60 text-xs mb-2">{t("stages.scheduled")}</Text>
      {streams.map(item => (
        <View key={item.streamId} className="flex-row items-center justify-between py-2" style={{ gap: 12 }}>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-white text-xs font-medium">{item.name}</Text>
            {item.scheduleAt != null && <Text className="text-white/60 text-xs mt-1">{new Date(item.scheduleAt).toLocaleString()}</Text>}
          </View>
          <TouchableOpacity accessibilityRole="button" disabled={!!starting} onPress={() => void start(item)} className="px-3 py-2 rounded-lg border border-white/20" style={{ opacity: starting ? 0.5 : 1 }}>
            <Text className="text-white text-xs">{t("stages.startNow")}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
