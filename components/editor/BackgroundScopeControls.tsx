import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { applyBackgroundToAllPages } from "../../libs/editor/pageBackgrounds";
import { getPages } from "../../libs/editor/pages";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function BackgroundScopeControls({ project, time, current, commit, select }: { project: ProjectSnapshot; time: number; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; select: (id: string) => void }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const count = getPages(project.settings, project.clips).length;
  const apply = () => {
    try { const latest = current(); if (!latest || latest.id !== project.id) return; const result = applyBackgroundToAllPages(latest, time, () => newId(10)); if (result.project !== latest) { commit(result.project); if (result.id) select(result.id); } setError(""); setMessage(t("editor.backgrounds.updated", { defaultValue: "Updated {{count}} pages", count: result.count }) + (result.skipped ? ` · ${t("editor.backgrounds.skipped", { defaultValue: "{{count}} locked pages preserved", count: result.skipped })}` : "")); }
    catch (value) { setError(value instanceof Error ? value.message : "Could not apply this background"); }
  };
  return <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={count < 2} accessibilityState={{ disabled: count < 2 }} onPress={apply} className="min-h-[40px] items-center justify-center rounded-lg border border-white/20 px-3" style={{ opacity: count < 2 ? 0.35 : 1 }}><Text className="text-xs text-white/80">{t("editor.backgrounds.applyAll", { defaultValue: "Copy page background to all pages" })}</Text></Pressable><Text className="text-xs text-white/45">{t("editor.backgrounds.hint", { defaultValue: "Copies this page’s photo, gradient, or solid background. Locked backgrounds stay unchanged." })}</Text>{message && <Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{message}</Text>}{error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
