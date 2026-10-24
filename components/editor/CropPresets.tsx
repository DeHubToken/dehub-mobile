import CropPrecisionControls from "./CropPrecisionControls";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CROP_ASPECTS, cropMediaToAspect, focusMediaCrop, mediaCropFocus, zoomMediaCrop } from "../../libs/editor/mediaCrop";
import { getMedia } from "../../libs/editor/storage";
import type { MediaClip } from "../../libs/editor/types";

export default function CropPresets({ clip, page, commit }: { clip: MediaClip; page: { width: number; height: number }; commit: (patch: Partial<MediaClip>) => void }) {
  const { t } = useTranslation();
  const [focal, setFocal] = useState(() => mediaCropFocus(clip));
  useEffect(() => setFocal(mediaCropFocus(clip)), [clip.crop, clip.transform?.flipH, clip.transform?.flipV]);
  const [source, setSource] = useState<{ id: string; width: number; height: number } | null>(null);
  useEffect(() => {
    let current = true;
    setSource(null);
    void getMedia(clip.mediaId).then(media => { if (current && media?.width && media.height) setSource({ id: clip.mediaId, width: media.width, height: media.height }); }).catch(() => {});
    return () => { current = false; };
  }, [clip.mediaId]);
  return <View className="mb-3" style={{ gap: 10 }}>
    <View className="flex-row flex-wrap" style={{ gap: 6 }}>{CROP_ASPECTS.map(preset => <Pressable key={preset.label} accessibilityRole="button" disabled={clip.locked || source?.id !== clip.mediaId} onPress={() => {
      if (!source || source.id !== clip.mediaId) return;
      const patch = cropMediaToAspect(clip, page, source, preset.ratio, focal.x, focal.y); if (patch) commit(patch);
    }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: clip.locked || !source ? 0.35 : 1 }}><Text className="text-xs text-white">{preset.ratio ? preset.label : t("editor.crop.original", { defaultValue: "Original" })}</Text></Pressable>)}</View>
    <View className="flex-row" style={{ gap: 8 }}>{[0.9, 1.1].map(zoom => <Pressable key={zoom} accessibilityRole="button" disabled={clip.locked} onPress={() => { const patch = zoomMediaCrop(clip, zoom); if (patch) commit(patch); }} className="min-h-[40px] flex-1 items-center justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white">{t(zoom < 1 ? "editor.crop.zoomOut" : "editor.crop.zoomIn", { defaultValue: zoom < 1 ? "Zoom image out" : "Zoom image in" })}</Text></Pressable>)}</View>
    <View className="flex-row items-center" style={{ gap: 12 }}><View style={{ width: 128, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{[0, 0.5, 1].flatMap(y => [0, 0.5, 1].map(x => <Pressable key={`${x}:${y}`} accessibilityRole="button" accessibilityState={{ selected: focal.x === x && focal.y === y, disabled: !!clip.locked }} accessibilityLabel={t("editor.crop.focusPoint", { defaultValue: "Focus {{x}}%, {{y}}%", x: x * 100, y: y * 100 })} disabled={clip.locked} onPress={() => { setFocal({ x, y }); const patch = focusMediaCrop(clip, x, y); if (patch) commit(patch); }} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1, borderColor: focal.x === x && focal.y === y ? "#ffffff" : "#555555", backgroundColor: focal.x === x && focal.y === y ? "#555555" : "#222222" }}><Text className="text-white">·</Text></Pressable>))}</View><Text className="flex-1 text-xs leading-5 text-white/50">{t("editor.crop.focusHint", { defaultValue: "Move the crop window while keeping its size." })}</Text></View>
    <CropPrecisionControls key={clip.id} focal={focal} pageRatio={page.width / page.height} disabled={!!clip.locked || source?.id !== clip.mediaId} onFocus={(x, y) => { const patch = focusMediaCrop(clip, x, y); if (patch) { setFocal({ x, y }); commit(patch); } }} onAspect={ratio => {
      if (!source || source.id !== clip.mediaId) return false;
      const patch = cropMediaToAspect(clip, page, source, ratio, focal.x, focal.y); if (!patch) return false; commit(patch); return true;
    }} />
  </View>;
}
