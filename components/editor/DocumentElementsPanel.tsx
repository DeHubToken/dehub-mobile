import RepeatPageScopeControls from "./RepeatPageScopeControls";
import { resolveRepeatPageScope, type RepeatPageScope } from "../../libs/editor/repeatPageScope";
import { designPageSections } from "../../libs/editor/pageDetails";
import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { newId } from "../../libs/editor/project";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { DEFAULT_PAGE_NUMBER_FORMAT, pageNumberText, type PageNumberFormat } from "../../libs/editor/pageNumbering";
import { putPageNumbers, removePageNumbers, repeatPageElements, type PageNumberPosition } from "../../libs/editor/documentElements";
import { getPages } from "../../libs/editor/pages";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function DocumentElementsPanel({ project, time, selectedId, current, commit }: { project: ProjectSnapshot; time: number; selectedId: string | null; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void }) {
  const { t } = useTranslation();
  const [repeatScope, setRepeatScope] = useState<RepeatPageScope>({ mode: "all", range: "", section: "" });
  const [format, setFormat] = useState<PageNumberFormat>({ ...DEFAULT_PAGE_NUMBER_FORMAT });
  const [position, setPosition] = useState<PageNumberPosition>("bottom-centre"), [skipFirst, setSkipFirst] = useState(false), [colour, setColour] = useState("#ffffff"), [fontSize, setFontSize] = useState("28"), [message, setMessage] = useState("");
  const count = getPages(project.settings, project.clips).length;
  const apply = (operation: (value: ProjectSnapshot) => ProjectSnapshot, success: string) => {
    try { const before = current(); if (!before || before.id !== project.id) return; const next = operation(before); if (next !== before) commit(next); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const action = (label: string, onPress: () => void, selected = false, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${selected ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 12 }}>
    <View className="flex-row items-center" style={{ gap: 12 }}><Text accessibilityLabel={t("editor.document.numberPreview", { defaultValue: "Page number preview" })} className="rounded-lg border border-white/20 px-4 py-3 text-lg text-white">{pageNumberText(0, count, format)}</Text><Text className="flex-1 text-xs text-white/60">{t("editor.document.numberHint", { defaultValue: "Add editable page numbers. Numbers update when pages are added, duplicated, deleted, or reordered. Locked numbers stay unchanged." })}</Text></View>
    <Text className="text-xs text-white/60">{t("editor.document.position", { defaultValue: "Position" })}</Text>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["top-left", "top-centre", "top-right", "bottom-left", "bottom-centre", "bottom-right"] as const).map(value => action(t(`editor.document.position.${value}`, { defaultValue: value.replace("-", " ") }), () => setPosition(value), value === position))}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["decimal", "roman", "alpha"] as const).map(style => action(style === "decimal" ? "1, 2, 3" : style === "roman" ? "I, II, III" : "A, B, C", () => setFormat({ ...format, style }), format.style === style))}</View>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      <Text className="text-xs text-white/60">{t("editor.document.start", { defaultValue: "Start at" })}</Text><TextInput keyboardType="number-pad" value={String(format.start)} onChangeText={value => setFormat({ ...format, start: Number(value) })} accessibilityLabel={t("editor.document.start", { defaultValue: "Start at" })} className="min-h-[40px] w-20 rounded-lg border border-white/20 px-3 text-xs text-white" />
      <Text className="text-xs text-white/60">{t("editor.document.size", { defaultValue: "Text size" })}</Text><TextInput keyboardType="number-pad" value={fontSize} onChangeText={setFontSize} accessibilityLabel={t("editor.document.size", { defaultValue: "Text size" })} className="min-h-[40px] w-20 rounded-lg border border-white/20 px-3 text-xs text-white" />
      {["#ffffff", "#111111", "#64748b", "#e2b76a", "#22d3ee"].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: colour === value }} onPress={() => setColour(value)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: value, borderWidth: 2, borderColor: colour === value ? "#38bdf8" : "#888" }} />)}
    </View>
    <View className="flex-row" style={{ gap: 8 }}><TextInput value={format.prefix} maxLength={40} onChangeText={prefix => setFormat({ ...format, prefix })} placeholder={t("editor.document.prefix", { defaultValue: "Prefix" })} accessibilityLabel={t("editor.document.prefix", { defaultValue: "Prefix" })} placeholderTextColor="#888" className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" /><TextInput value={format.suffix} maxLength={40} onChangeText={suffix => setFormat({ ...format, suffix })} placeholder={t("editor.document.suffix", { defaultValue: "Suffix" })} accessibilityLabel={t("editor.document.suffix", { defaultValue: "Suffix" })} placeholderTextColor="#888" className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" /></View>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}><Switch value={format.total} onValueChange={total => setFormat({ ...format, total })} accessibilityLabel={t("editor.document.total", { defaultValue: "Show total pages" })} /><Text className="text-xs text-white/65">{t("editor.document.total", { defaultValue: "Show total pages" })}</Text><Switch value={skipFirst} onValueChange={setSkipFirst} accessibilityLabel={t("editor.document.skipCover", { defaultValue: "Hide on first page" })} /><Text className="text-xs text-white/65">{t("editor.document.skipCover", { defaultValue: "Hide on first page" })}</Text></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{action(t("editor.document.applyNumbers", { defaultValue: "Apply page numbers" }), () => apply(value => putPageNumbers(value, { format, position, skipFirst, colour, fontSize: Number(fontSize) }, newId), t("editor.document.numbersApplied", { defaultValue: "Page numbers applied" })))}{action(t("editor.document.removeNumbers", { defaultValue: "Remove page numbers" }), () => apply(removePageNumbers, t("editor.document.numbersRemoved", { defaultValue: "Unlocked page numbers removed" })), false, !project.clips.some(clip => clip.kind === "text" && clip.pageNumber && !clip.locked))}</View>
    <RepeatPageScopeControls value={repeatScope} sections={designPageSections(project)} onChange={setRepeatScope} />
    <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}><Text className="text-xs text-white/60">{t("editor.document.repeatHint", { defaultValue: "Select a header, footer, logo, or still artwork to copy it to the same position on chosen pages. Each copy stays independently editable." })}</Text>{action(t("editor.document.repeat", { defaultValue: "Copy selection to other pages" }), () => apply(value => repeatPageElements(value, selectedId ? [selectedId] : [], time, newId, resolveRepeatPageScope(value, repeatScope)).project, t("editor.document.repeated", { defaultValue: "Selected elements copied to the chosen pages" })), false, !selectedId || count < 2)}</View>
    {!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-100">{message}</Text>}
  </View>;
}
