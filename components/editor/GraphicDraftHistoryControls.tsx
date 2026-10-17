import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

export default function GraphicDraftHistoryControls({ undo, redo, canUndo, canRedo }: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) {
  const { t } = useTranslation();
  return <View className="rounded-lg border border-white/10 p-2" style={{ gap: 8 }}><Text className="text-[10px] text-white/45">{t("editor.graphicDraftHistory.local", { defaultValue: "Graphic draft" })}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>{[{ label: t("editor.graphicDraftHistory.undo", { defaultValue: "Undo draft change" }), action: undo, enabled: canUndo }, { label: t("editor.graphicDraftHistory.redo", { defaultValue: "Redo draft change" }), action: redo, enabled: canRedo }].map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ disabled: !item.enabled }} disabled={!item.enabled} onPress={item.action} style={{ opacity: item.enabled ? 1 : 0.35 }} className="min-h-[40px] justify-center rounded-md border border-white/20 px-3"><Text className="text-xs text-white/70">{item.label}</Text></Pressable>)}</View></View>;
}
