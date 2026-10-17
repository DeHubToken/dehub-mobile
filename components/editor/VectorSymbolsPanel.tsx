import SvgPathImportControls from "./SvgPathImportControls";
import SvgArtworkDownload from "./SvgArtworkDownload";
import { vectorSymbolSvgDocument } from "../../libs/editor/vectorSymbolSvgDocument";
import { useEditorLibrary } from "../../libs/editor/useEditorLibrary";
import ColourPickerButton from "./ColourPickerButton";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { VECTOR_SYMBOLS, putVectorSymbol, searchVectorSymbols, vectorSymbolSvg } from "../../libs/editor/vectorSymbols";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

const CATEGORY_NAMES: Record<string, string> = { all: "All", saved: "Saved", recent: "Recent", essentials: "Essentials", communication: "Communication", media: "Media and games", people: "People", objects: "Objects", nature: "Nature", commerce: "Commerce", learning: "Learning", travel: "Travel", technology: "Technology", food: "Food and drink" };

export default function VectorSymbolsPanel({ project, time, selectedId, current, commit, select }: {
  project: ProjectSnapshot; time: number; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void;
}) {
  const { t } = useTranslation();
  const library = useEditorLibrary("symbols");
  const selected = project.clips.find(clip => clip.id === selectedId);
  const existing = selected?.kind === "shape" && selected.symbol ? selected : undefined;
  const [symbol, setSymbol] = useState("check-circle"), [query, setQuery] = useState(""), [category, setCategory] = useState("all"), [page, setPage] = useState(0);
  const [colour, setColour] = useState("#ffffff"), [weight, setWeight] = useState(8);
  useEffect(() => { if (existing) { setSymbol(existing.symbol!); setColour(existing.stroke?.color ?? "#ffffff"); setWeight(existing.stroke?.width ?? 8); } }, [existing?.id, existing?.symbol, existing?.stroke]);
  const matches = useMemo(() => searchVectorSymbols(query, category === "saved" || category === "recent" ? "all" : category)
    .filter(item => category !== "saved" && category !== "recent" || library[category].includes(item.id))
    .sort((a, b) => category === "recent" ? library.recent.indexOf(a.id) - library.recent.indexOf(b.id) : 0), [query, category, library.saved, library.recent]);
  const index = Math.min(page, Math.max(0, Math.ceil(matches.length / 24) - 1)), chosen = VECTOR_SYMBOLS.find(item => item.id === symbol), validColour = /^#[\da-f]{6}$/i.test(colour);
  const chip = (label: string, onPress: () => void, active = false, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white/15" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <SvgPathImportControls key={project.id} projectId={project.id} time={time} current={current} commit={commit} select={select} />
    <ColourPickerButton projectId={project.id} onPick={setColour} />
    <TextInput value={query} onChangeText={value => { setQuery(value); setPage(0); }} accessibilityLabel={t("editor.symbols.search", { defaultValue: "Search vector symbols" })} placeholder={t("editor.symbols.search", { defaultValue: "Search vector symbols" })} placeholderTextColor="#888888" autoCorrect={false} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-sm text-white" />
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{Object.entries(CATEGORY_NAMES).map(([value, label]) => chip(t(`editor.symbols.category.${value}`, { defaultValue: label }), () => { setCategory(value); setPage(0); }, category === value))}</ScrollView>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{matches.slice(index * 24, index * 24 + 24).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={t(`editor.symbols.item.${item.id}`, { defaultValue: item.label })} accessibilityState={{ selected: symbol === item.id }} onPress={() => setSymbol(item.id)} className={`items-center justify-center rounded-lg border p-2 ${symbol === item.id ? "border-white bg-white/15" : "border-white/10"}`} style={{ width: "22%", minHeight: 80, gap: 6 }}><Svg width={30} height={30} viewBox="-1 -1 26 26"><Path d={vectorSymbolSvg(item.id)} fill="none" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" /></Svg><Text numberOfLines={1} className="text-[10px] text-white/75">{t(`editor.symbols.item.${item.id}`, { defaultValue: item.label })}</Text></Pressable>)}</View>
    {!matches.length && <Text className="text-xs text-white/50">{t("editor.symbols.noResults", { defaultValue: "No matching symbols. Try another name or category." })}</Text>}
    {matches.length > 24 && <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>{chip(t("editor.symbols.previous", { defaultValue: "Previous symbols" }), () => setPage(index - 1), false, index === 0)}<Text className="text-xs text-white/50">{index + 1} / {Math.ceil(matches.length / 24)}</Text>{chip(t("editor.symbols.next", { defaultValue: "Next symbols" }), () => setPage(index + 1), false, (index + 1) * 24 >= matches.length)}</View>}
    <View className="flex-row items-center border-t border-white/10 pt-3" style={{ gap: 12 }}><Svg width={40} height={40} viewBox="-1 -1 26 26"><Path d={vectorSymbolSvg(symbol)} fill="none" stroke={validColour ? colour : "#ffffff"} strokeWidth={Math.max(0.5, weight / 6)} strokeLinecap="round" strokeLinejoin="round" /></Svg><Text className="text-xs text-white/75">{chosen && t(`editor.symbols.item.${chosen.id}`, { defaultValue: chosen.label })}</Text></View>
    <Text className="text-xs text-white/60">{t("editor.symbols.colour", { defaultValue: "Colour" })}</Text><TextInput value={colour} onChangeText={setColour} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.symbols.colour", { defaultValue: "Colour" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <Text className="text-xs text-white/60">{t("editor.symbols.weight", { defaultValue: "Line weight" })}: {weight}</Text><Slider minimumValue={1} maximumValue={40} step={1} value={weight} onValueChange={setWeight} accessibilityLabel={t("editor.symbols.weight", { defaultValue: "Line weight" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" />
    <SvgArtworkDownload key={`${project.id}:${selectedId ?? "new"}:${symbol}`} getSvg={() => vectorSymbolSvgDocument(symbol, colour, weight)} disabled={!chosen || !validColour} title={chosen?.label || "Symbol"} label={t("editor.symbols.downloadSvg", { defaultValue: "Download symbol as SVG" })} hint={t("editor.symbols.vectorDownloadHint", { defaultValue: "Exports the library symbol with the chosen colour and line weight on a transparent background." })} />
    {chip(t(library.saved.includes(symbol) ? "editor.symbols.unsave" : "editor.symbols.save", { defaultValue: library.saved.includes(symbol) ? "Remove from saved symbols" : "Save symbol" }), () => library.toggle(symbol), library.saved.includes(symbol))}
    <Pressable accessibilityRole="button" disabled={!!existing?.locked || !validColour} onPress={() => { const latest = current(); if (!latest || latest.id !== project.id) return; const result = putVectorSymbol(latest, time, symbol, colour, weight, () => newId(10), existing?.id); if (result) { commit(result.project); library.record(symbol); select(result.id); } }} className="min-h-[40px] items-center justify-center rounded-lg bg-white px-3" style={{ opacity: existing?.locked || !validColour ? 0.35 : 1 }}><Text className="text-xs font-medium text-black">{t(existing ? "editor.symbols.update" : "editor.symbols.insert", { defaultValue: existing ? "Update symbol" : "Insert symbol" })}</Text></Pressable>
    <Text className="text-xs text-white/45">{t("editor.symbols.hint", { defaultValue: "Symbols stay editable. Recolour, resize, rotate, group, or add effects using the layer controls." })}</Text>
  </View>;
}
