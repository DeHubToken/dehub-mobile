import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";

export default function PasteDataImportControls({ onPrepare }: { onPrepare: (source: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [source, setSource] = useState("");
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.dataImport.paste", { defaultValue: "Paste spreadsheet data" })} {open ? "−" : "+"}</Text></Pressable>
    {open && <View style={{ gap: 12 }}>
      <TextInput value={source} onChangeText={setSource} maxLength={500000} multiline numberOfLines={5} textAlignVertical="top" autoCorrect={false} autoCapitalize="none" accessibilityLabel={t("editor.dataImport.pastedSource", { defaultValue: "Spreadsheet data to import" })} placeholder={"Category\tValue\nNorth\t42\nSouth\t58"} placeholderTextColor="#888" className="min-h-[120px] rounded-lg border border-white/20 p-3 text-xs text-white" />
      <Text className="text-[10px] text-white/45">{t("editor.dataImport.pasteHint", { defaultValue: "Paste cells copied from a spreadsheet, or CSV text. Choose columns, headings, number punctuation and a row window in the next step. Your current draft stays available until you use the selection." })}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !source.trim() }} disabled={!source.trim()} onPress={() => onPrepare(source)} style={{ opacity: source.trim() ? 1 : 0.35 }} className="min-h-[44px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.dataImport.prepare", { defaultValue: "Choose data to use" })}</Text></Pressable>
    </View>}
  </View>;
}
