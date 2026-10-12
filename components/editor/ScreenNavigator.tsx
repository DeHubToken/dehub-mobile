import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { pageAt, type Page } from "../../libs/editor/pages";
import type { Clip } from "../../libs/editor/types";

export default function ScreenNavigator({ pages, clips, time, onPick, onEdit, onPreview, onTimeline }: {
  pages: Page[]; clips: Clip[]; time: number;
  onPick: (page: Page) => void; onEdit: () => void; onPreview: () => void; onTimeline: () => void;
}) {
  const { t } = useTranslation();
  if (pages.length < 2) return null;
  const current = pageAt(pages, time);
  return <View className="border-y border-white/10 bg-black px-3 py-2" style={{ gap: 8 }}>
    <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
      <Text className="text-white text-xs">{t("editor.pages.position", { current: current.index + 1, total: pages.length })}</Text>
      <Pressable accessibilityRole="button" onPress={onEdit} className="rounded-lg bg-white/10 px-3 justify-center" style={{ minHeight: 44 }}><Text className="text-white text-xs">{t("editor.menu.editText")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onTimeline} className="rounded-lg bg-white/10 px-3 justify-center" style={{ minHeight: 44 }}><Text className="text-white text-xs">{t("editor.canvas.showTimeline")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onPreview} className="rounded-lg bg-white/10 px-3 justify-center" style={{ minHeight: 44 }}><Text className="text-white text-xs">{t("creator.preview")} · {t("creator.navVideo")}</Text></Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {pages.map(page => {
        const headline = clips.filter(c => c.kind === "text" && c.start < page.end && c.start + c.duration > page.start).sort((a, b) => (b.kind === "text" ? b.fontSize : 0) - (a.kind === "text" ? a.fontSize : 0))[0];
        const active = page.index === current.index;
        return <Pressable key={page.index} accessibilityRole="button" accessibilityLabel={`${t("editor.pages.page", { number: page.index + 1 })}: ${headline?.kind === "text" ? headline.text : ""}`} accessibilityState={{ selected: active }} onPress={() => onPick(page)} className={`rounded-lg px-3 py-2 ${active ? "bg-white" : "bg-white/10"}`} style={{ minHeight: 44, width: 132 }}>
          <Text className={`text-xs font-semibold ${active ? "text-black" : "text-white"}`}>{t("editor.pages.page", { number: page.index + 1 })} · {Number((page.end - page.start).toFixed(2))}s</Text>
          <Text className={`text-xs mt-1 ${active ? "text-black/65" : "text-white/65"}`} numberOfLines={1}>{headline?.kind === "text" ? headline.text : ""}</Text>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}
