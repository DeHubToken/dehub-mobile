import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { findDesignText, replaceDesignText } from "../../libs/editor/designTools";
import type { ProjectSnapshot } from "../../libs/editor/types";
import DocumentFonts from "./DocumentFonts";

export default function DesignTextSearch({ project, apply, seek }: { project: ProjectSnapshot;
  apply: (operation: (p: ProjectSnapshot) => ProjectSnapshot) => void; seek: (id: string, time: number) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const results = findDesignText(project, query, matchCase);
  const field = "min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-sm text-white";
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
    <View className="flex-row" style={{ gap: 8 }}>
      <TextInput accessibilityLabel={t("editor.designTools.find", { defaultValue: "Find text" })} placeholder={t("editor.designTools.find", { defaultValue: "Find text" })} placeholderTextColor="#888" value={query} onChangeText={setQuery} autoCapitalize="none" className={field} />
      <TextInput accessibilityLabel={t("editor.designTools.replaceWith", { defaultValue: "Replace with" })} placeholder={t("editor.designTools.replaceWith", { defaultValue: "Replace with" })} placeholderTextColor="#888" value={replacement} onChangeText={setReplacement} autoCapitalize="none" className={field} />
    </View>
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Switch accessibilityLabel={t("editor.designTools.matchCase", { defaultValue: "Match case" })} value={matchCase} onValueChange={setMatchCase} />
      <Text className="flex-1 text-xs text-white/60">{t("editor.designTools.matchCase", { defaultValue: "Match case" })}</Text>
      <Pressable accessibilityRole="button" disabled={!results.some(c => !c.locked)} onPress={() => apply(p => replaceDesignText(p, query, replacement, matchCase))} className="min-h-[40px] justify-center rounded-lg bg-white px-3" style={{ opacity: results.some(c => !c.locked) ? 1 : 0.35 }}><Text className="text-xs font-semibold text-black">{t("editor.designTools.replaceAll", { defaultValue: "Replace all" })}</Text></Pressable>
    </View>
    {query !== "" && <Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{t("editor.designTools.matches", { defaultValue: "{{count}} text layers found", count: results.length })}</Text>}
    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {results.map(clip => <View key={clip.id} className="flex-row items-center rounded-lg border border-white/15">
        <Pressable accessibilityRole="button" onPress={() => seek(clip.id, clip.start)} className="min-h-[40px] max-w-[200px] justify-center px-3"><Text numberOfLines={1} className="text-xs text-white">{clip.text}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={clip.locked} onPress={() => apply(p => replaceDesignText(p, query, replacement, matchCase, [clip.id]))} className="min-h-[40px] justify-center border-l border-white/15 px-3" style={{ opacity: clip.locked ? 0.35 : 1 }}><Text className="text-xs text-white/70">{t("editor.designTools.replace", { defaultValue: "Replace" })}</Text></Pressable>
      </View>)}
    </ScrollView>
    <DocumentFonts project={project} apply={apply} />
  </ScrollView>;
}
