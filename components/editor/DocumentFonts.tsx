import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { designFonts, replaceDesignFont } from "../../libs/editor/designFonts";
import { GOOGLE_FONTS } from "../../libs/editor/fontCatalogue";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function DocumentFonts({ project, apply }: { project: ProjectSnapshot; apply: (operation: (p: ProjectSnapshot) => ProjectSnapshot) => void }) {
  const { t } = useTranslation();
  const fonts = designFonts(project);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("Inter");
  const [query, setQuery] = useState("");
  const source = fonts.find(font => font.family === from) ?? fonts[0];
  const target = GOOGLE_FONTS.find(font => font.family === to);
  if (!fonts.length) return null;
  return <View className="rounded-lg border border-white/15 p-3" style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white">{t("editor.fonts.replaceDesign", { defaultValue: "Replace a font throughout this design" })}</Text></Pressable>
    {open && <>
      <Text className="text-xs text-white/55">{t("editor.fonts.source", { defaultValue: "Font to replace" })}</Text>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>{fonts.map(font => <Pressable key={font.family} accessibilityRole="button" accessibilityState={{ selected: source?.family === font.family }} onPress={() => setFrom(font.family)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${source?.family === font.family ? "border-white bg-white/15" : "border-white/15"}`}><Text className="text-xs text-white">{font.family} · {font.count}</Text></Pressable>)}</ScrollView>
      <TextInput value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.fonts.target", { defaultValue: "Replacement font" })} placeholder={t("editor.fonts.search", { defaultValue: "Search fonts" })} placeholderTextColor="#888" className="min-h-[40px] rounded-lg border border-white/20 px-3 text-xs text-white" />
      <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>{GOOGLE_FONTS.filter(font => font.family.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 20).map(font => <Pressable key={font.family} accessibilityRole="button" accessibilityState={{ selected: to === font.family }} onPress={() => setTo(font.family)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${to === font.family ? "border-white bg-white/15" : "border-white/15"}`}><Text className="text-xs text-white">{font.family}</Text></Pressable>)}</ScrollView>
      <Pressable accessibilityRole="button" disabled={!source || !target || source.family === target.family} onPress={() => { if (!source || !target) return; apply(p => replaceDesignFont(p, source.css, target)); setFrom(target.family); }} className="min-h-[40px] items-center justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t("editor.designTools.changeAll", { defaultValue: "Change all" })} → {to}</Text></Pressable>
      <Text className="text-xs text-white/45">{t("editor.fonts.graphicCoverage", { defaultValue: "Includes text layers, charts and tables. Locked layers keep their fonts." })}</Text>
    </>}
  </View>;
}
