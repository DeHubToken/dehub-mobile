import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { newId } from "../../libs/editor/project";
import { createQrGraphic, putQrGraphic } from "../../libs/editor/qrGraphic";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function QrPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const selected = project.clips.find(c => c.id === selectedId);
  const qr = selected?.kind === "shape" ? selected.qr : undefined;
  const [content, setContent] = useState("https://dehub.io");
  const [foreground, setForeground] = useState("#000000"), [background, setBackground] = useState("#ffffff");
  const [error, setError] = useState("");
  useEffect(() => { if (qr) { setContent(qr.content); setForeground(qr.foreground); setBackground(qr.background); } }, [selected?.id, qr]);
  const apply = () => {
    try {
      const before = current();
      if (!before || before.id !== project.id) return;
      const result = putQrGraphic(before, time, createQrGraphic(content, foreground, background), () => newId(10), selectedId);
      if (result) { commit(result.project); select(result.id); setError(""); }
    } catch { setError(t("editor.qr.failed", { defaultValue: "Use shorter text and two different hex colours." })); }
  };
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.qr.hint", { defaultValue: "Create a QR code for a link or text. Keep strong contrast between the foreground and background." })}</Text>
    <TextInput multiline value={content} onChangeText={setContent} maxLength={1500} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.qr.content", { defaultValue: "Link or text" })} className="min-h-[70px] rounded-lg border border-white/20 px-3 py-2 text-sm text-white" />
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <TextInput value={foreground} onChangeText={setForeground} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.qr.foreground", { defaultValue: "Foreground" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" />
      <TextInput value={background} onChangeText={setBackground} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.qr.background", { defaultValue: "Background" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" />
      <Pressable accessibilityRole="button" disabled={!content.trim() || foreground === background || (!!qr && !!selected?.locked)} onPress={apply} className="min-h-[40px] justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t(qr ? "editor.qr.update" : "editor.qr.insert", { defaultValue: qr ? "Update QR code" : "Insert QR code" })}</Text></Pressable>
    </View>
    {error !== "" && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
