import React, { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTranslation } from "react-i18next";
import type { StockItem } from "../../libs/editor/stock";

function VideoPreview({ item, onError }: { item: StockItem; onError: () => void }) {
  const player = useVideoPlayer(item.downloadUrl, video => { video.loop = true; });
  useEffect(() => {
    const error = player.addListener("statusChange", status => { if (status.status === "error") onError(); });
    const background = AppState.addEventListener("change", state => { if (state !== "active") player.pause(); });
    if (AppState.currentState === "active") player.play();
    return () => { error.remove(); background.remove(); };
  }, [player, onError]);
  return <VideoView player={player} nativeControls style={{ width: "100%", height: 220 }} contentFit="contain" />;
}

function AudioPreview({ item }: { item: StockItem }) {
  const { t } = useTranslation();
  const player = useAudioPlayer({ uri: item.downloadUrl });
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    const background = AppState.addEventListener("change", state => { if (state !== "active") player.pause(); });
    if (AppState.currentState === "active") player.play();
    return () => { background.remove(); };
  }, [player]);
  const toggle = async () => {
    if (status.playing) player.pause();
    else { if (status.didJustFinish) await player.seekTo(0); player.play(); }
  };
  return <View style={{ gap: 10 }}>
    <Text className="text-white tabular-nums">{t("editor.export.duration", { value: `${Math.floor(status.currentTime || 0)} / ${Math.floor(status.duration || item.duration || 0)}` })}</Text>
    <Pressable accessibilityRole="button" onPress={() => { void toggle(); }} className="self-start rounded-lg bg-white px-4 py-2">
      <Text className="text-black">{t(status.playing ? "audioPost.pause" : "audioPost.play")}</Text>
    </Pressable>
  </View>;
}

export default function StockMediaPreview({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const fail = React.useCallback(() => setFailed(true), []);
  return <View className="rounded-xl border border-white/20 bg-black p-3" style={{ gap: 10 }}>
    <Text className="text-white font-semibold">{item.title}</Text>
    {failed ? <Text className="text-theme-neutrals-400">{t("common.failedToLoad")}</Text> : item.mimeType.startsWith("video/") ? <VideoPreview item={item} onError={fail} />
      : item.mimeType.startsWith("audio/") ? <AudioPreview item={item} />
      : <Image source={{ uri: item.downloadUrl }} style={{ width: "100%", height: 220 }} contentFit="contain" onError={fail} />}
    <Pressable accessibilityRole="button" onPress={onClose} className="self-start rounded-lg bg-white/10 px-4 py-2">
      <Text className="text-white">{t("common.close")}</Text>
    </Pressable>
  </View>;
}
