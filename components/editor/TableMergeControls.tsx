import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { addTableMerge, tableMergeLabel, type TableMerge } from "../../libs/editor/tableMerges";

export default function TableMergeControls({ value, rows, columns, onChange }: { value?: TableMerge[]; rows: number; columns: number; onChange: (value: TableMerge[] | undefined) => void }) {
  const { t } = useTranslation(), [range, setRange] = useState("A1:B1"), [error, setError] = useState("");
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" disabled={disabled} onPress={onPress} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="border-t border-white/10 pt-3" style={{ gap: 10 }}><Text className="text-xs text-white/65">{t("editor.tables.mergeRange", { defaultValue: "Merge cells" })}</Text><View className="flex-row flex-wrap items-center" style={{ gap: 8 }}><TextInput value={range} onChangeText={value => { setRange(value); setError(""); }} autoCapitalize="characters" autoCorrect={false} maxLength={15} placeholder="A1:C2" placeholderTextColor="#888" accessibilityLabel={t("editor.tables.cellRange", { defaultValue: "Cell range, for example A1:C2" })} className="min-h-[40px] w-28 rounded-lg border border-white/20 px-3 text-xs text-white" />{button(t("editor.tables.merge", { defaultValue: "Merge range" }), () => { try { onChange(addTableMerge(value, range, rows, columns)); setError(""); } catch (value) { setError(value instanceof Error ? value.message : String(value)); } }, !rows || !columns)}{button(t("editor.tables.unmergeAll", { defaultValue: "Unmerge all" }), () => { onChange(undefined); setError(""); }, !value?.length)}</View>
    <Text className="text-xs text-white/45">{t("editor.tables.mergeHint", { defaultValue: "Merged cells display the top-left cell. Content in covered cells is kept and reappears when unmerged." })}</Text>
    {!!value?.length && <View className="flex-row flex-wrap" style={{ gap: 8 }}>{value.map((merge, index) => button(t("editor.tables.unmergeRange", { defaultValue: "Unmerge {{range}}", range: tableMergeLabel(merge) }), () => { onChange(value.filter((_, position) => position !== index)); setError(""); }))}</View>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
