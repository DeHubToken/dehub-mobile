import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { designSelectionKey, similarDesignSelection, type SimilarSelectionKind } from "../../libs/editor/similarSelection";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function SimilarSelectionControls({ project, ids, time, current, onChange }: { project: ProjectSnapshot; ids: string[]; time: number; current: () => ProjectSnapshot | null; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation(), reference = project.clips.find(clip => clip.id === ids[0]);
  const choose = (kind: SimilarSelectionKind | "all") => { const latest = current(); if (latest?.id === project.id) onChange(similarDesignSelection(latest, ids[0] ?? null, time, kind)); };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" disabled={disabled} onPress={onPress} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View style={{ gap: 8 }}><View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>{button(t("editor.selection.allPage", { defaultValue: "Select all on page" }), () => choose("all"))}{(["type", "colour", "font"] as const).map(kind => button(t(`editor.selection.same.${kind}`, { defaultValue: ({ type: "Select same type", colour: "Select same colour", font: "Select same font" })[kind] }), () => choose(kind), !reference || designSelectionKey(reference, kind) === null))}{button(t("editor.selection.clear", { defaultValue: "Clear selection" }), () => onChange([]), !ids.length)}</View><Text className="text-xs text-white/45">{t("editor.selection.count", { defaultValue: "{{count}} selected", count: ids.length })}</Text><Text className="text-xs text-white/45">{t("editor.selection.sameHint", { defaultValue: "Match the first selected layer on this page. Groups stay together; hidden layers, backgrounds, and locked groups are skipped." })}</Text></View>;
}
