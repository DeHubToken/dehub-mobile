import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { adjacentDataCell, dataCellPosition } from "../../libs/editor/dataCellAddress";

export default function DataCellValueEditor({ address, value, rows, columns, onNavigate, onChange }: { address: string; value: string; rows: number; columns: number; onNavigate: (address: string) => void; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(address), [error, setError] = useState("");
  useEffect(() => { setTarget(address); setError(""); }, [address]);
  const move = () => {
    const normalized = target.trim().toUpperCase();
    if (!dataCellPosition(normalized, rows, columns)) { setError(t("editor.dataCells.invalidAddress", { defaultValue: "Choose an existing cell between A1 and {{last}}", last: `${String.fromCharCode(64 + columns)}${rows}` })); return; }
    setError(""); onNavigate(normalized);
  };
  const previous = adjacentDataCell(address, rows, columns, -1), next = adjacentDataCell(address, rows, columns, 1);
  return <View className="rounded-lg border border-white/15 bg-white/[0.03] p-3" style={{ gap: 8 }}>
    <View className="flex-row items-center" style={{ gap: 8 }}><Text className="text-xs text-white/65">{t("editor.dataCells.goTo", { defaultValue: "Go to cell" })}</Text><TextInput value={target} maxLength={3} onChangeText={text => { setTarget(text.toUpperCase()); setError(""); }} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={move} returnKeyType="go" accessibilityLabel={t("editor.dataCells.goTo", { defaultValue: "Go to cell" })} style={{ width: 64 }} className="min-h-[40px] rounded-md border border-white/20 px-2 text-xs text-white" /><Pressable accessibilityRole="button" onPress={move} className="min-h-[40px] justify-center rounded-md border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.dataCells.go", { defaultValue: "Go" })}</Text></Pressable></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{([{ label: t("editor.dataCells.previousCell", { defaultValue: "Previous cell" }), destination: previous }, { label: t("editor.dataCells.nextCell", { defaultValue: "Next cell" }), destination: next }]).map(item => <Pressable key={item.label} accessibilityRole="button" disabled={!item.destination} accessibilityState={{ disabled: !item.destination }} onPress={() => { if (item.destination) onNavigate(item.destination); }} style={{ opacity: item.destination ? 1 : 0.35 }} className="min-h-[40px] justify-center rounded-md border border-white/20 px-3"><Text className="text-xs text-white/65">{item.label}</Text></Pressable>)}</View>
    <Text className="text-xs text-white/65">{t("editor.dataCells.editCell", { defaultValue: "Edit {{address}}", address })}</Text><TextInput value={value} multiline numberOfLines={2} maxLength={200} autoCorrect={false} textAlignVertical="top" onChangeText={onChange} accessibilityLabel={t("editor.dataCells.editCell", { defaultValue: "Edit {{address}}", address })} className="min-h-[72px] rounded-md border border-white/20 p-2 text-xs text-white" />
    <Text className="text-[10px] text-white/40">{t("editor.dataCells.valueHint", { defaultValue: "Edit the whole cell here, including line breaks. Values are stored as text; formulas are not calculated." })} {value.length}/200</Text>
    {!!error && <Text accessibilityRole="alert" className="text-xs text-amber-200">{error}</Text>}
  </View>;
}
