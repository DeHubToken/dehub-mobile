import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { findEditorGuide } from "../../libs/editor/editorGuide";
import type { DesignToolPanelId } from "../../libs/editor/designCommands";

export default function EditorGuidePanel({ onOpen }: { onOpen: (panel: DesignToolPanelId) => void }) {
  const { t } = useTranslation(), [query, setQuery] = useState(""), entries = useMemo(() => findEditorGuide(query, "mobile"), [query]);
  return <View className="px-3" style={{ gap: 12 }}><TextInput value={query} onChangeText={setQuery} autoCorrect={false} accessibilityLabel={t("editor.help.searchMobile", { defaultValue: "Search gestures and editor help" })} placeholder={t("editor.help.searchMobile", { defaultValue: "Search gestures and editor help" })} placeholderTextColor="#888" className="min-h-[40px] rounded-lg border border-white/20 px-3 text-xs text-white" />{entries.map(entry => <View key={entry.id} className="rounded-lg border border-white/15 p-3" style={{ gap: 8 }}><Text className="text-xs font-semibold text-white/85">{t(`editor.help.entry.${entry.id}.title`, { defaultValue: entry.title })}</Text><Text className="text-xs leading-relaxed text-white/60">{t(`editor.help.entry.${entry.id}.mobile`, { defaultValue: entry.mobile })}</Text>{entry.panel && <Pressable accessibilityRole="button" onPress={() => onOpen(entry.panel!)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.help.openTool", { defaultValue: "Open tool" })}</Text></Pressable>}</View>)}{!entries.length && <Text className="text-xs text-white/45">{t("editor.help.noResults", { defaultValue: "No matching help. Try a tool name or an action such as paste, crop, or group." })}</Text>}</View>;
}
