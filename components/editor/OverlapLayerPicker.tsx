import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { designLayerChoices } from "../../libs/editor/layerChoices";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function OverlapLayerPicker({ project, ids, selectedId, onSelect, onClose }: { project: Pick<ProjectSnapshot, "clips" | "tracks">; ids: string[]; selectedId: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation(), [query, setQuery] = useState(""), [offset, setOffset] = useState(0);
  const choices = designLayerChoices(project, ids).filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const first = Math.min(offset, Math.max(0, Math.floor((choices.length - 1) / 20) * 20));
  const button = (label: string, press: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={press} className="min-h-[44px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View className="flex-1 justify-center bg-black/75 px-5"><View className="rounded-2xl border border-white/15 bg-neutral-950 p-4" style={{ maxHeight: "80%", gap: 12 }}>
    <View className="flex-row items-center" style={{ gap: 8 }}><Text className="flex-1 text-base font-semibold text-white">{t("editor.layers.overlapping", { defaultValue: "Overlapping layers" })}</Text>{button(t("common.close", { defaultValue: "Close" }), onClose)}</View>
    <Text className="text-xs text-white/55">{t("editor.layers.overlapHint", { defaultValue: "Choose the layer underneath. The frontmost layer appears first." })}</Text>
    <TextInput autoCorrect={false} autoCapitalize="none" value={query} onChangeText={value => { setQuery(value); setOffset(0); }} accessibilityLabel={t("editor.layers.searchOverlap", { defaultValue: "Search overlapping layers" })} placeholder={t("editor.layers.searchOverlap", { defaultValue: "Search overlapping layers" })} placeholderTextColor="#888888" className="min-h-[44px] rounded-lg border border-white/20 px-3 text-sm text-white" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>{choices.slice(first, first + 20).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === item.id }} onPress={() => { onSelect(item.id); onClose(); }} className={`min-h-[48px] rounded-lg border px-3 py-2 ${selectedId === item.id ? "border-cyan-300 bg-cyan-300/10" : "border-white/10"}`}><Text numberOfLines={1} className="text-sm text-white">{item.label}</Text><Text className="text-xs text-white/45">{t(`editor.layers.kind.${item.kind}`, { defaultValue: item.kind })}{item.grouped ? ` · ${t("editor.layers.grouped", { defaultValue: "Grouped" })}` : ""}</Text></Pressable>)}{!choices.length && <Text className="py-4 text-center text-sm text-white/45">{t("editor.layers.noOverlapMatches", { defaultValue: "No matching layers at this position" })}</Text>}</ScrollView>
    {choices.length > 20 && <View className="flex-row items-center justify-between" style={{ gap: 8 }}>{button(t("common.previous", { defaultValue: "Previous" }), () => setOffset(first - 20), !first)}<Text className="text-xs text-white/45">{Math.floor(first / 20) + 1} / {Math.ceil(choices.length / 20)}</Text>{button(t("common.next", { defaultValue: "Next" }), () => setOffset(first + 20), first + 20 >= choices.length)}</View>}
  </View></View></Modal>;
}
