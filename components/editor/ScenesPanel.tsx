import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Page } from "../../libs/editor/pages";
import type { Clip } from "../../libs/editor/types";
export default function ScenesPanel({ pages, current, onPick, onAdd, onDelete, clips = [], onEditText }: { clips?: Clip[]; onEditText?: (id: string) => void; pages: Page[]; current: number; onPick: (start: number) => void; onAdd: (duplicate: boolean) => void; onDelete: (index: number) => void }) {
  const { t } = useTranslation();
  return <View style={{ gap: 12 }}>
    <Text className="text-white">{t("editor.pages.position", { current: current + 1, total: pages.length })}</Text>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {pages.map(page => <Pressable key={page.index} accessibilityRole="button" accessibilityState={{ selected: page.index === current }}
        onPress={() => onPick(page.start)} className={`rounded-xl px-4 py-3 ${page.index === current ? "bg-white" : "bg-white/10"}`}>
        <Text className={page.index === current ? "text-black" : "text-white"}>{t("editor.pages.page", { number: page.index + 1 })}</Text>
      </Pressable>)}
    </View>
    {onEditText && clips.filter(c => c.kind === "text" && c.start < pages[current].end && c.start + c.duration > pages[current].start).map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${t("editor.menu.editText")}: ${c.kind === "text" ? c.text : ""}`} onPress={() => onEditText(c.id)} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3" style={{ minHeight: 44 }}>
      <Text className="text-theme-neutrals-400 text-xs mb-1">{t("editor.menu.editText")}</Text><Text className="text-white" numberOfLines={3}>{c.kind === "text" ? c.text : ""}</Text>
    </Pressable>)}
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => onAdd(false)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.add")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onAdd(true)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.duplicate")}</Text></Pressable>
      {pages.length > 1 && <Pressable accessibilityRole="button" onPress={() => onDelete(current)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.delete")}</Text></Pressable>}
    </View>
  </View>;
}
