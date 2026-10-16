import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { parseTableData, type TableData } from "../../libs/editor/dataVisuals";
import { editTableStructure, type TableAxis, type TableStructureAction } from "../../libs/editor/tableStructure";

export default function TableStructureControls({ value, source, onChange, onSource, focusedCell }: {
  value: Omit<TableData, "rows">; source: string; focusedCell?: string; onChange: (value: Omit<TableData, "rows">) => void; onSource: (source: string) => void;
}) {
  const { t } = useTranslation();
  const [axis, setAxis] = useState<TableAxis>("row"), [index, setIndex] = useState(0), [error, setError] = useState("");
  const dimensions = useMemo(() => { try { const rows = parseTableData(source); return { row: rows.length, column: Math.max(0, ...rows.map(row => row.length)) }; } catch { return { row: 0, column: 0 }; } }, [source]);
  useEffect(() => {
    const match = focusedCell?.match(/^([A-L])(\d+)$/);
    if (match) { setIndex(axis === "row" ? Number(match[2]) - 1 : match[1].charCodeAt(0) - 65); setError(""); }
  }, [axis, focusedCell]);
  const total = dimensions[axis], selected = Math.min(index, Math.max(0, total - 1));
  const labels = { before: axis === "row" ? "Insert above" : "Insert left", after: axis === "row" ? "Insert below" : "Insert right", duplicate: "Duplicate", delete: "Delete", earlier: axis === "row" ? "Move up" : "Move left", later: axis === "row" ? "Move down" : "Move right" };
  const disabled = (action: TableStructureAction) => !total || (["before", "after", "duplicate"].includes(action) && total >= (axis === "row" ? 20 : 12)) || action === "delete" && total <= 1 || action === "earlier" && selected === 0 || action === "later" && selected === total - 1;
  const change = (action: TableStructureAction) => {
    try { const next = editTableStructure(source, value, axis, selected, action); onChange(next.format); onSource(next.source); setIndex(next.selected); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change this table"); }
  };
  return <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}>
    <Text className="text-xs font-semibold text-white/80">{t("editor.tables.structure", { defaultValue: "Rows and columns" })}</Text>
    <View className="flex-row" style={{ gap: 8 }}>{(["row", "column"] as const).map(key => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: axis === key }} onPress={() => { setAxis(key); setIndex(0); setError(""); }} className={`min-h-[40px] justify-center rounded-lg border px-3 ${axis === key ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white/75">{t(`editor.tables.axis.${key}`, { defaultValue: key === "row" ? "Row" : "Column" })}</Text></Pressable>)}</View>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{Array.from({ length: total }, (_, index) => <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected: selected === index }} onPress={() => setIndex(index)} className={`min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border px-3 ${selected === index ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white">{axis === "row" ? index + 1 : String.fromCharCode(65 + index)}</Text></Pressable>)}</ScrollView>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["before", "after", "duplicate", "earlier", "later", "delete"] as const).map(action => <Pressable key={action} accessibilityRole="button" accessibilityState={{ disabled: disabled(action) }} disabled={disabled(action)} onPress={() => change(action)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled(action) ? 0.35 : 1 }}><Text className={`text-xs ${action === "delete" ? "text-red-300" : "text-white/75"}`}>{t(`editor.tables.structureAction.${axis}.${action}`, { defaultValue: labels[action] })}</Text></Pressable>)}</View>
    <Text className="text-xs text-white/45">{t("editor.tables.structureHint", { defaultValue: "Cell formatting and relative sizes follow their rows and columns. Headers stay on the first row or column." })}</Text>
    {error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
