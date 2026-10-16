import DataCellValueEditor from "./DataCellValueEditor";
import { dataCellAddress, dataCellPosition } from "../../libs/editor/dataCellAddress";
import type { TableAxis, TableStructureAction } from "../../libs/editor/tableStructure";
import type { TextInput as NativeTextInput } from "react-native";
import DataPastePanel from "./DataPastePanel";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { formatDelimitedData, parseDelimitedData } from "../../libs/editor/delimitedData";

export default function DataCells({ value, onChange, chart, multiSeries = false, onCellFocus, onStructure, pageSize = 5 }: { value: string; onChange: (value: string) => void; chart: boolean; multiSeries?: boolean; onCellFocus?: (address: string) => void; onStructure?: (axis: TableAxis, index: number, action: TableStructureAction) => void; pageSize?: 5 | 10 | 20 }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0), [address, setAddress] = useState("A1");
  const inputRefs = useRef(new Map<string, NativeTextInput>()), pendingFocus = useRef<{ row: number; column: number } | null>(null), horizontal = useRef<ScrollView>(null);
  const parsed = useMemo(() => { try { return { rows: parseDelimitedData(value, chart ? multiSeries ? 51 : 50 : 20, chart ? multiSeries ? 7 : 2 : 12), error: "" }; } catch (error) { return { rows: [], error: error instanceof Error ? error.message : "Invalid data" }; } }, [value, chart, multiSeries]);
  const rows = parsed.rows.length ? parsed.rows : [["", ""]];
  const columns = chart && !multiSeries ? 2 : Math.max(chart ? 2 : 1, ...rows.map(row => row.length));
  const activePosition = dataCellPosition(address, rows.length, columns) ?? { row: 0, column: 0 };
  const activeAddress = dataCellAddress(activePosition.row, activePosition.column);
  const editActiveValue = (text: string) => {
    onCellFocus?.(activeAddress);
    update(rows.map((row, index) => index === activePosition.row ? Array.from({ length: columns }, (_, column) => column === activePosition.column ? text.slice(0, 200) : row[column] ?? "") : row));
  };
  const start = Math.min(offset, Math.floor((rows.length - 1) / pageSize) * pageSize);
  const update = (next: string[][]) => onChange(formatDelimitedData(next, "\t"));
  useEffect(() => { const desired = pendingFocus.current; if (!desired) return; const element = inputRefs.current.get(`${desired.row}:${desired.column}`); if (element) { element.focus(); horizontal.current?.scrollTo({ x: desired.column * 120, animated: true }); pendingFocus.current = null; } }, [value, start, columns]);
  const nextCell = (row: number, column: number) => {
    const position = row * columns + column + 1, nextRow = Math.floor(position / columns), nextColumn = position % columns, limit = chart ? multiSeries ? 51 : 50 : 20;
    if (nextRow >= limit) return;
    if (nextRow >= rows.length) { if (onStructure && parsed.rows.length) onStructure("row", rows.length - 1, "after"); else update([...rows, Array(columns).fill("")]); }
    pendingFocus.current = { row: nextRow, column: nextColumn }; setOffset(Math.floor(nextRow / pageSize) * pageSize);
    const element = inputRefs.current.get(`${nextRow}:${nextColumn}`); if (element) { element.focus(); horizontal.current?.scrollTo({ x: nextColumn * 120, animated: true }); pendingFocus.current = null; }
  };
  const navigate = (target: string) => {
    const cell = dataCellPosition(target, rows.length, columns); if (!cell) return;
    setAddress(target); onCellFocus?.(target); pendingFocus.current = cell; setOffset(Math.floor(cell.row / pageSize) * pageSize);
    const element = inputRefs.current.get(`${cell.row}:${cell.column}`);
    if (element) { element.focus(); horizontal.current?.scrollTo({ x: cell.column * 120, animated: true }); pendingFocus.current = null; }
  };
  const button = (label: string, action: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={action} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{label}</Text></Pressable>;
  if (parsed.error) return <Text className="text-xs text-amber-200">{parsed.error} {t("editor.dataVisual.fixSource", { defaultValue: "Use Source data to correct this input." })}</Text>;
  return <View style={{ gap: 8 }}>
    <DataCellValueEditor address={activeAddress} value={rows[activePosition.row]?.[activePosition.column] ?? ""} rows={rows.length} columns={columns} onNavigate={navigate} onChange={editActiveValue} />

    <ScrollView ref={horizontal} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator>
      <View className="overflow-hidden rounded-lg border border-white/20">
        <View className="flex-row bg-white/5"><Text style={{ width: 28 }} className="py-2 text-center text-xs text-white/40">#</Text>{Array.from({ length: columns }, (_, c) => <Text key={c} style={{ width: 120 }} className="border-l border-white/10 px-2 py-2 text-xs text-white/60">{chart && !multiSeries ? t(c === 0 ? "editor.dataVisual.label" : "editor.dataVisual.value", { defaultValue: c === 0 ? "Label" : "Value" }) : String.fromCharCode(65 + c)}</Text>)}</View>
        {rows.slice(start, start + pageSize).map((row, r) => <View key={start + r} className="flex-row border-t border-white/10"><Text style={{ width: 28 }} className="self-center text-center text-xs text-white/40">{start + r + 1}</Text>{Array.from({ length: columns }, (_, c) => <TextInput key={c} ref={element => { const key = `${start + r}:${c}`; if (element) inputRefs.current.set(key, element); else inputRefs.current.delete(key); }} selectTextOnFocus returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => nextCell(start + r, c)} style={{ width: 120 }} value={row[c] ?? ""} onFocus={() => { const address = `${String.fromCharCode(65 + c)}${start + r + 1}`; setAddress(address); onCellFocus?.(address); }} accessibilityLabel={t("editor.dataVisual.cell", { defaultValue: "Row {{row}}, column {{column}}", row: start + r + 1, column: c + 1 })} onChangeText={text => update(rows.map((cells, index) => index === start + r ? Array.from({ length: columns }, (_, col) => col === c ? text : cells[col] ?? "") : cells))} maxLength={200} autoCorrect={false} className={`min-h-[40px] border-l px-2 text-xs text-white ${activePosition.row === start + r && activePosition.column === c ? "border-sky-300/50 bg-sky-300/10" : "border-white/10"}`} />)}<Pressable accessibilityRole="button" disabled={!!onStructure && rows.length <= 1} accessibilityState={{ disabled: !!onStructure && rows.length <= 1 }} style={{ opacity: onStructure && rows.length <= 1 ? 0.35 : 1 }} accessibilityLabel={t("editor.dataVisual.removeRow", { defaultValue: "Remove row {{row}}", row: start + r + 1 })} onPress={() => onStructure && parsed.rows.length ? onStructure("row", start + r, "delete") : update(rows.filter((_, index) => index !== start + r))} className="min-h-[40px] min-w-[40px] items-center justify-center"><Text className="text-base text-white/50">×</Text></Pressable></View>)}
      </View>
    </ScrollView>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {button(t("editor.dataVisual.addRow", { defaultValue: "Add row" }), () => { if (onStructure && parsed.rows.length) onStructure("row", rows.length - 1, "after"); else update([...rows, Array(columns).fill("")]); setOffset(Math.floor(rows.length / pageSize) * pageSize); }, rows.length >= (chart ? multiSeries ? 51 : 50 : 20))}
      {(!chart || multiSeries) && button(t("editor.dataVisual.addColumn", { defaultValue: "Add column" }), () => onStructure && parsed.rows.length ? onStructure("column", columns - 1, "after") : update(rows.map(row => [...Array.from({ length: columns }, (_, i) => row[i] ?? ""), ""])), columns >= (chart ? 7 : 12))}
      {(!chart || multiSeries) && button(t("editor.dataVisual.removeColumn", { defaultValue: "Remove last column" }), () => onStructure && parsed.rows.length ? onStructure("column", columns - 1, "delete") : update(rows.map(row => row.slice(0, columns - 1))), columns <= (chart ? 2 : 1))}
    </View>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      {button(t("editor.dataVisual.previousRows", { defaultValue: "Previous rows" }), () => setOffset(Math.max(0, start - pageSize)), start === 0)}
      <Text className="text-xs text-white/50">{start + 1}–{Math.min(rows.length, start + pageSize)} / {rows.length}</Text>
      {button(t("editor.dataVisual.nextRows", { defaultValue: "Next rows" }), () => setOffset(start + pageSize), start + pageSize >= rows.length)}
    </View>
    <DataPastePanel source={value} onChange={onChange} address={address} onAddress={setAddress} maxRows={chart ? multiSeries ? 51 : 50 : 20} maxColumns={chart ? multiSeries ? 7 : 2 : 12} />
  </View>;
}
