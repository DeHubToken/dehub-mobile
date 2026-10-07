import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Page } from "../../libs/editor/pages";
export default function ScenesPanel({ pages, current, onPick, onAdd, onDelete }: { pages: Page[]; current: number; onPick: (start: number) => void; onAdd: (duplicate: boolean) => void; onDelete: (index: number) => void }) {
  const { t } = useTranslation();
  return <View style={{ gap: 12 }}>
    <Text className="text-white">{t("editor.pages.position", { current: current + 1, total: pages.length })}</Text>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {pages.map(page => <Pressable key={page.index} accessibilityRole="button" accessibilityState={{ selected: page.index === current }}
        onPress={() => onPick(page.start)} className={`rounded-xl px-4 py-3 ${page.index === current ? "bg-white" : "bg-white/10"}`}>
        <Text className={page.index === current ? "text-black" : "text-white"}>{t("editor.pages.page", { number: page.index + 1 })}</Text>
      </Pressable>)}
    </View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => onAdd(false)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.add")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onAdd(true)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.duplicate")}</Text></Pressable>
      {pages.length > 1 && <Pressable accessibilityRole="button" onPress={() => onDelete(current)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.delete")}</Text></Pressable>}
    </View>
  </View>;
}
