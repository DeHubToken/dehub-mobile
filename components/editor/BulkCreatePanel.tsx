import BulkPageFieldsControls from "./BulkPageFieldsControls";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { bulkPageFieldsConnected, type BulkPageFields, bulkConnected, bulkFieldText, bulkTemplateFields, bulkTextValue, createBulkPages, parseBulkData, type BulkConnections } from "../../libs/editor/bulkCreate";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function BulkCreatePanel({ project, time, current, commit, seek }: {
  project: ProjectSnapshot; time: number; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; seek: (id: string, time: number) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState("Name,Role\nAlex,Designer\nSam,Producer");
  const [pageFields, setPageFields] = useState<BulkPageFields>({});
  const [connections, setConnections] = useState<BulkConnections>({});
  const [first, setFirst] = useState("1"), [last, setLast] = useState("");
  const [rowIndex, setRowIndex] = useState(0), [fieldPage, setFieldPage] = useState(0);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const parsed = useMemo(() => { try { return { data: parseBulkData(source), error: "" }; } catch (value) { return { data: null, error: value instanceof Error ? value.message : "Invalid spreadsheet data" }; } }, [source]);
  const fields = useMemo(() => bulkTemplateFields(project, time), [project, time]);
  const data = parsed.data, connected = data ? fields.filter(clip => bulkConnected(clip, data.headers, connections)) : [];
  const previewIndex = Math.min(rowIndex, (data?.rows.length ?? 1) - 1), previewRow = data?.rows[previewIndex];
  const end = Number(last || data?.rows.length || 0), page = Math.min(fieldPage, Math.max(0, Math.ceil(fields.length / 8) - 1));
  const changeSource = (value: string) => { setSource(value); setMessage(""); setError(""); setRowIndex(0); setLast(""); };
  const importFile = async () => {
    const token = ++request.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/tab-separated-values", "text/plain", "application/vnd.ms-excel"], copyToCacheDirectory: true });
      if (result.canceled || token !== request.current) return;
      const file = result.assets[0];
      if ((file.size ?? 0) > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const info = await FileSystem.getInfoAsync(file.uri);
      if (info.exists && info.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await FileSystem.readAsStringAsync(file.uri);
      if (text.length > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      if (token === request.current && current()?.id === project.id) changeSource(text);
    } catch (value) { if (token === request.current) setError(value instanceof Error ? value.message : "Could not read this file"); }
  };
  const generate = () => {
    try {
      const latest = current();
      if (!data || !latest || latest.id !== project.id) return;
      const result = createBulkPages(latest, time, data, connections, Number(first), end, () => newId(10), pageFields);
      commit(result.project);
      const firstClip = result.project.clips.find(clip => clip.kind !== "audio" && clip.start >= result.start);
      if (firstClip) seek(firstClip.id, result.start);
      setMessage(t("editor.bulk.created", { defaultValue: "Created {{count}} pages. Undo restores the original design.", count: result.count })); setError("");
    } catch (value) { setError(value instanceof Error ? value.message : "Could not generate pages"); }
  };
  const button = (label: string, onPress: () => void, disabled = false, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white/15" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.bulk.hint", { defaultValue: "Use the current page as a template. Connect text and QR layers to spreadsheet columns, or put column names in double braces inside your text. Each selected row creates a new page; the original stays in place." })}</Text>
    {button(t("editor.bulk.import", { defaultValue: "Import CSV or TSV" }), () => { void importFile(); })}
    <Text className="text-xs text-white/45">{t("editor.bulk.limits", { defaultValue: "Up to 50 rows and 20 columns" })}</Text>
    <TextInput multiline value={source} onChangeText={value => { request.current++; changeSource(value); }} maxLength={500000} accessibilityLabel={t("editor.bulk.data", { defaultValue: "Spreadsheet data with column headers" })} autoCorrect={false} autoCapitalize="none" textAlignVertical="top" className="min-h-[100px] rounded-lg border border-white/20 p-2 text-xs text-white" />
    {data && <>
      <Text className="text-xs text-white/60">{data.rows.length} {t("editor.bulk.rows", { defaultValue: "data rows" })}</Text>
      <View className="flex-row" style={{ gap: 10 }}><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t("editor.bulk.first", { defaultValue: "From row" })}</Text><TextInput value={first} onChangeText={setFirst} keyboardType="number-pad" accessibilityLabel={t("editor.bulk.first", { defaultValue: "From row" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t("editor.bulk.last", { defaultValue: "To row" })}</Text><TextInput value={last || String(data.rows.length)} onChangeText={setLast} keyboardType="number-pad" accessibilityLabel={t("editor.bulk.last", { defaultValue: "To row" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View></View>
      <BulkPageFieldsControls headers={data.headers} row={previewRow} value={pageFields} onChange={value => { setPageFields(value); setMessage(""); }} />
      {!fields.length && <Text className="text-xs text-white/60">{t("editor.bulk.noText", { defaultValue: "Add an unlocked text or QR layer to this page to connect your data." })}</Text>}
      {fields.slice(page * 8, page * 8 + 8).map(clip => <View key={clip.id} className="rounded-lg border border-white/10 p-2" style={{ gap: 8 }}><Text numberOfLines={2} className="text-xs text-white/80">{clip.label || (clip.kind === "shape" ? "QR: " + bulkFieldText(clip) : bulkFieldText(clip)) || t("editor.bulk.emptyText", { defaultValue: "Empty text layer" })}</Text><ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{button(t("editor.bulk.placeholders", { defaultValue: "Use placeholders in text" }), () => setConnections(value => ({ ...value, [clip.id]: "" })), false, !connections[clip.id])}{data.headers.map(header => button(header, () => { setConnections(value => ({ ...value, [clip.id]: header })); setMessage(""); }, false, connections[clip.id] === header))}</ScrollView>{previewRow && <Text className="text-xs text-white/50">{bulkTextValue(clip, data.headers, previewRow, connections).slice(0, 500)}</Text>}</View>)}
      {fields.length > 8 && <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>{button(t("editor.bulk.previousLayers", { defaultValue: "Previous layers" }), () => setFieldPage(page - 1), page === 0)}<Text className="text-xs text-white/60">{page + 1} / {Math.ceil(fields.length / 8)}</Text>{button(t("editor.bulk.nextLayers", { defaultValue: "Next layers" }), () => setFieldPage(page + 1), (page + 1) * 8 >= fields.length)}</View>}
      <Text className="text-xs text-white/60">{t("editor.bulk.preview", { defaultValue: "Preview data row" })} {previewIndex + 1}: {(previewRow?.[0] || "—").slice(0, 60)}</Text>
      <View className="flex-row" style={{ gap: 8 }}>{button(t("editor.bulk.previousRow", { defaultValue: "Previous row" }), () => setRowIndex(previewIndex - 1), previewIndex === 0)}{button(t("editor.bulk.nextRow", { defaultValue: "Next row" }), () => setRowIndex(previewIndex + 1), previewIndex + 1 >= data.rows.length)}</View>
      {button(t("editor.bulk.generate", { defaultValue: "Generate {{count}} pages", count: Math.max(0, end - Number(first) + 1) || 0 }), generate, (!connected.length && !bulkPageFieldsConnected(data.headers, pageFields)) || !Number.isInteger(Number(first)) || Number(first) < 1 || !Number.isInteger(end) || end < Number(first) || end > data.rows.length)}
    </>}
    {(parsed.error || error) && <Text accessibilityRole="alert" className="text-xs text-red-300">{error || parsed.error}</Text>}
    {message && <Text accessibilityLiveRegion="polite" className="text-xs text-emerald-300">{message}</Text>}
  </View>;
}
