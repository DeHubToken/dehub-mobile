import React, { useMemo, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import EditorCanvas from "./EditorCanvas";
import { assemblyPreviewProject } from "../../libs/editor/assemblyLibrary";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const NO_FONTS: string[] = [];
const unchanged = () => {};

export default function AssemblyMediaPreview({ clip, project, name, onClose }: {
  clip: MediaClip; project: ProjectSnapshot; name: string; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const preview = useMemo(() => assemblyPreviewProject(project, clip), [project, clip]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(clip.kind !== "image");
  const pageHeight = Math.min(height * 0.55, (width - 48) * project.settings.height / project.settings.width);
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View className="flex-1 items-center justify-center bg-black/80 p-6">
      <View className="w-full rounded-xl border border-white/15 bg-black p-3" style={{ gap: 12 }}>
        <Text className="text-white text-sm" numberOfLines={2}>{t("editor.shots.preview")} · {name}</Text>
        <View pointerEvents="none" style={{ height: pageHeight }}>
          <EditorCanvas project={preview} time={time} playing={playing} fontCss={NO_FONTS} selectedId={null}
            onSelect={unchanged} onLiveChange={unchanged} onGestureEnd={unchanged} onEditText={unchanged}
            onTime={setTime} onEnded={() => setPlaying(false)} />
        </View>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {clip.kind !== "image" && <Pressable accessibilityRole="button" accessibilityLabel={t("editor.shots.preview")}
            onPress={() => { setTime(0); setPlaying(true); }} className="rounded-lg border border-white/20 px-3 py-2"><Text className="text-white">{t("editor.shots.preview")}</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={onClose}
            className="rounded-lg border border-white/20 px-3 py-2"><Text className="text-white">{t("common.cancel")}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}
