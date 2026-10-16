import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { newId } from "../../libs/editor/project";
import { parsePageSelection } from "../../libs/editor/pageExports";
import { getPages } from "../../libs/editor/pages";
import { transferDesignSelection } from "../../libs/editor/pageLayerTransfer";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PageLayerTransferControls({ project, ids, time, current, commit, onMoved }: { project: ProjectSnapshot; ids: readonly string[]; time: number; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; onMoved?: () => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [range, setRange] = useState(""), [error, setError] = useState(""), [status, setStatus] = useState("");
  const apply = (move: boolean) => {
    try {
      const before = current(); if (!before || before.id !== project.id) return;
      const targets = parsePageSelection(range.replace(/[–—]/g, "-"), getPages(before.settings, before.clips).length), result = transferDesignSelection(before, ids, time, targets, move, () => newId(10));
      commit(result.project); if (move) onMoved?.();
      setStatus(t(move ? "editor.pages.layersMoved" : "editor.pages.layersCopied", { defaultValue: move ? "Moved {{count}} layers to page {{page}}" : "Copied {{count}} layers across {{pages}} pages", count: result.count, page: targets[0] + 1, pages: result.pages })); setError("");
    } catch (reason) { setStatus(""); setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <View className="rounded-lg border border-white/15 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/80">{t("editor.pages.transferLayers", { defaultValue: "Move or copy selected layers to pages" })}</Text></Pressable>{open && <><TextInput value={range} onChangeText={value => { setRange(value); setStatus(""); setError(""); }} autoCorrect={false} autoCapitalize="none" maxLength={2000} placeholder="2, 4-6" placeholderTextColor="#888" accessibilityLabel={t("editor.pages.layerDestinations", { defaultValue: "Destination page numbers or ranges" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-xs text-white" /><View className="flex-row flex-wrap" style={{ gap: 8 }}>{[false, true].map(move => <Pressable key={String(move)} accessibilityRole="button" disabled={!ids.length || !range.trim()} accessibilityState={{ disabled: !ids.length || !range.trim() }} onPress={() => apply(move)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: !ids.length || !range.trim() ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t(move ? "editor.pages.moveLayersToPage" : "editor.pages.copyLayersToPages", { defaultValue: move ? "Move to page" : "Copy to pages" })}</Text></Pressable>)}</View><Text className="text-xs text-white/45">{t("editor.pages.transferHint", { defaultValue: "Copy to up to 50 pages, or move to one. Groups and placement follow the selection. Moving affects this page only; other appearances are kept. The destination must fit timed layers." })}</Text></>}{!!status && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{status}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
