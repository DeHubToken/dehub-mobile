import DesignTextReplacementDetails from "./DesignTextReplacementDetails";
import { designTextSnippet } from "../../libs/editor/designTextMatching";
import { designTextResultTime, designTextScopeIds, nextDesignTextMatch, type DesignTextScope } from "../../libs/editor/textSearchScope";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { findDesignText, replaceDesignText, replaceFirstDesignText } from "../../libs/editor/designTools";
import type { ProjectSnapshot } from "../../libs/editor/types";
import DocumentFonts from "./DocumentFonts";

export default function DesignTextSearch({ project, apply, seek, time, selectedId }: { project: ProjectSnapshot; time: number; selectedId: string | null;
  apply: (operation: (p: ProjectSnapshot) => ProjectSnapshot) => void; seek: (id: string, time: number) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false), [scope, setScope] = useState<DesignTextScope>("all"), [offset, setOffset] = useState(0);
  const scoped = designTextScopeIds(project, time, scope, selectedId ? [selectedId] : []), allowed = scoped ? new Set(scoped) : null;
  const results = findDesignText(project, query, matchCase, wholeWords).filter(clip => !allowed || allowed.has(clip.id)), first = Math.min(offset, Math.max(0, Math.floor((results.length - 1) / 20) * 20));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = results.findIndex(clip => clip.id === activeId);
  const visit = (index: number) => {
    const clip = results[index]; if (!clip) return;
    setActiveId(clip.id); setOffset(Math.floor(index / 20) * 20);
    seek(clip.id, designTextResultTime(project, clip, time));
  };
  const field = "min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-sm text-white";
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
    <View className="flex-row" style={{ gap: 8 }}>
      <TextInput accessibilityLabel={t("editor.designTools.find", { defaultValue: "Find text" })} placeholder={t("editor.designTools.find", { defaultValue: "Find text" })} placeholderTextColor="#888" value={query} returnKeyType="search" onSubmitEditing={() => visit(nextDesignTextMatch(results.length, activeIndex, 1))} maxLength={2000} onChangeText={value => { setQuery(value); setActiveId(null); setOffset(0); }} autoCapitalize="none" className={field} />
      <TextInput accessibilityLabel={t("editor.designTools.replaceWith", { defaultValue: "Replace with" })} placeholder={t("editor.designTools.replaceWith", { defaultValue: "Replace with" })} placeholderTextColor="#888" value={replacement} maxLength={10000} onChangeText={setReplacement} autoCapitalize="none" className={field} />
    </View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["all", "page", "selection"] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: scope === value }} onPress={() => { setScope(value); setOffset(0); }} className={`min-h-[40px] justify-center rounded-lg border px-3 ${scope === value ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white/75">{t(`editor.textSearch.scope.${value}`, { defaultValue: ({ all: "Whole design", page: "Current page", selection: "Selection" })[value] })}</Text></Pressable>)}</View>
    <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={wholeWords} onValueChange={value => { setWholeWords(value); setOffset(0); }} accessibilityLabel={t("editor.textSearch.wholeWords", { defaultValue: "Whole words" })} /><Text className="text-xs text-white/60">{t("editor.textSearch.wholeWords", { defaultValue: "Whole words" })}</Text></View>
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Switch accessibilityLabel={t("editor.designTools.matchCase", { defaultValue: "Match case" })} value={matchCase} onValueChange={setMatchCase} />
      <Text className="flex-1 text-xs text-white/60">{t("editor.designTools.matchCase", { defaultValue: "Match case" })}</Text>
      <Pressable accessibilityRole="button" disabled={!results.some(c => !c.locked)} onPress={() => apply(p => replaceDesignText(p, query, replacement, matchCase, designTextScopeIds(p, time, scope, selectedId ? [selectedId] : []), wholeWords))} className="min-h-[40px] justify-center rounded-lg bg-white px-3" style={{ opacity: results.some(c => !c.locked) ? 1 : 0.35 }}><Text className="text-xs font-semibold text-black">{t("editor.designTools.replaceAll", { defaultValue: "Replace all" })}</Text></Pressable>
    </View>
    {query !== "" && <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}><Text accessibilityLiveRegion="polite" className="mr-auto text-xs text-white/60">{activeIndex >= 0 ? `${activeIndex + 1} / ${results.length}` : t("editor.designTools.matches", { defaultValue: "{{count}} text layers found", count: results.length })}</Text>{([-1, 1] as const).map(direction => <Pressable key={direction} accessibilityRole="button" disabled={!results.length} onPress={() => visit(nextDesignTextMatch(results.length, activeIndex, direction))} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: results.length ? 1 : 0.35 }}><Text className="text-xs text-white/65">{t(direction === -1 ? "editor.textSearch.previousMatch" : "editor.textSearch.nextMatch", { defaultValue: direction === -1 ? "Previous match" : "Next match" })}</Text></Pressable>)}</View>}
    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {results.slice(first, first + 20).map(clip => { const snippet = designTextSnippet(clip.text, query, matchCase, wholeWords); return <View key={clip.id} style={{ width: 320 }} className="flex-row flex-wrap items-center rounded-lg border border-white/15">
        <Pressable accessibilityRole="button" accessibilityState={{ selected: activeId === clip.id }} onPress={() => visit(results.findIndex(value => value.id === clip.id))} className="min-h-[40px] max-w-[200px] justify-center px-3"><Text numberOfLines={1} className="text-xs text-white">{snippet.before}<Text style={{ color: "#cffafe", backgroundColor: "rgba(34,211,238,0.18)" }}>{snippet.match}</Text>{snippet.after}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={clip.locked} onPress={() => apply(p => replaceDesignText(p, query, replacement, matchCase, [clip.id], wholeWords))} className="min-h-[40px] justify-center border-l border-white/15 px-3" style={{ opacity: clip.locked ? 0.35 : 1 }}><Text className="text-xs text-white/70">{t("editor.textSearch.replaceLayer", { defaultValue: "Replace in layer" })}</Text></Pressable><DesignTextReplacementDetails text={clip.text} query={query} replacement={replacement} matchCase={matchCase} wholeWords={wholeWords} locked={clip.locked} onReplaceFirst={() => apply(value => replaceFirstDesignText(value, clip.id, query, replacement, matchCase, wholeWords))} />
      </View>; })}
    </ScrollView>
    {results.length > 20 && <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={!first} onPress={() => setOffset(first - 20)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: first ? 1 : 0.35 }}><Text className="text-xs text-white/65">{t("editor.textSearch.previous", { defaultValue: "Previous matches" })}</Text></Pressable><Text className="text-xs text-white/45">{first + 1}–{Math.min(first + 20, results.length)} / {results.length}</Text><Pressable accessibilityRole="button" disabled={first + 20 >= results.length} onPress={() => setOffset(first + 20)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: first + 20 >= results.length ? 0.35 : 1 }}><Text className="text-xs text-white/65">{t("editor.textSearch.next", { defaultValue: "Next matches" })}</Text></Pressable></View>}
    <DocumentFonts project={project} apply={apply} />
  </ScrollView>;
}
