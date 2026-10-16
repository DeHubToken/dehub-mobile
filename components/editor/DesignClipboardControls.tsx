import React, { useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { copyDesignSelection, cutDesignSelection, getDesignClipboard, getDesignClipboardSnapshot, pasteDesignSelection, reportDesignClipboard, subscribeDesignClipboard } from "../../libs/editor/designClipboard";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function DesignClipboardControls({ project, selectedId, ids, time, current, commit, select, onPasted }: {
  project: ProjectSnapshot; selectedId?: string | null; ids?: readonly string[]; time: number;
  current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; select: (id: string | null) => void; onPasted?: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeDesignClipboard, getDesignClipboardSnapshot, getDesignClipboardSnapshot), chosen = ids ?? (selectedId ? [selectedId] : []);
  const feedback = state.feedback;
  const message = !feedback ? "" : feedback.kind === "error" ? feedback.message : t(`editor.clipboard.result.${feedback.kind}`, { defaultValue: ({ copied: "Copied {{count}} layers", pasted: "Pasted {{count}} layers", cut: "Cut {{count}} layers" })[feedback.kind], count: feedback.count }) + (feedback.kind === "pasted" && feedback.skipped ? ` · ${t("editor.clipboard.skipped", { defaultValue: "{{count}} did not fit this page", count: feedback.skipped })}` : "");
  const action = (paste: boolean) => {
    try {
      const latest = current(); if (!latest || latest.id !== project.id) return;
      if (!paste) { if (!copyDesignSelection(latest, chosen, time)) reportDesignClipboard({ kind: "error", message: t("editor.clipboard.empty", { defaultValue: "Select unlocked foreground layers on this page" }) }); return; }
      const result = pasteDesignSelection(latest, time, state.clipboard, () => newId(10));
      if (result) { commit(result.project); select(result.ids[0]); onPasted?.(result.ids); reportDesignClipboard({ kind: "pasted", count: result.ids.length, skipped: result.skipped }); }
    } catch (value) { reportDesignClipboard({ kind: "error", message: value instanceof Error ? value.message : "Could not copy these layers" }); }
  };
  const button = (paste: boolean) => { const disabled = paste ? !state.clipboard : !chosen.length; return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={() => action(paste)} className="min-h-[40px] justify-center rounded-lg bg-white/5 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{t(paste ? "editor.clipboard.paste" : "editor.clipboard.copy", { defaultValue: paste ? "Paste layers" : "Copy layers" })}</Text></Pressable>; };
  const cut = () => {
    try { const latest = current(); if (!latest || latest.id !== project.id) return; const next = cutDesignSelection(latest, chosen, time, () => newId(10)); if (next !== latest) { commit(next); select(null); onPasted?.([]); reportDesignClipboard({ kind: "cut", count: getDesignClipboard()?.layers.length ?? 0 }); } }
    catch (value) { reportDesignClipboard({ kind: "error", message: value instanceof Error ? value.message : "Could not cut these layers" }); }
  };
  return <View className="flex-row items-center" style={{ gap: 6 }}>{button(false)}<Pressable accessibilityRole="button" disabled={!chosen.length} onPress={cut} className="min-h-[40px] justify-center rounded-lg bg-white/5 px-3" style={{ opacity: !chosen.length ? 0.35 : 1 }}><Text className="text-xs text-white">{t("editor.clipboard.cut", { defaultValue: "Cut layers" })}</Text></Pressable>{button(true)}{message && <Text accessibilityRole={feedback?.kind === "error" ? "alert" : undefined} accessibilityLiveRegion="polite" numberOfLines={2} style={{ maxWidth: 140 }} className={`text-[10px] ${feedback?.kind === "error" ? "text-red-300" : "text-white/45"}`}>{message}</Text>}</View>;
}
