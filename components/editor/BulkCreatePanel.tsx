import BulkConnectionFileControls from "./BulkConnectionFileControls";
import BulkAutoConnectControls from "./BulkAutoConnectControls";
import BulkPlaceholderControls from "./BulkPlaceholderControls";
import BulkPagePreview from "./BulkPagePreview";
import DataImportMappingControls from "./DataImportMappingControls";
import PasteDataImportControls from "./PasteDataImportControls";
import BulkDataExportControls from "./BulkDataExportControls";
import BulkPhotoNames from "./BulkPhotoNames";
import { getMedia } from "../../libs/editor/storage";
import { projectReviewSnapshotKey } from "../../libs/editor/cloudProjectReview";
import BulkPhotoConnectionsControls from "./BulkPhotoConnectionsControls";
import { bulkImageFields, bulkPhotoNames, planBulkPhotos } from "../../libs/editor/bulkPhotos";
import BulkLinkConnectionsControls from "./BulkLinkConnectionsControls";
import BulkRowFilterControls from "./BulkRowFilterControls";
import { bulkSelectedRows, bulkSelectedCount, type BulkRowFilter } from "../../libs/editor/bulkRowFilter";
import BulkPageFieldsControls from "./BulkPageFieldsControls";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { bulkLinkFields, bulkPageFieldsConnected, type BulkPageFields, bulkConnected, bulkFieldText, bulkTemplateFields, bulkTextPreviewValue, createBulkPages, parseBulkData, type BulkConnections } from "../../libs/editor/bulkCreate";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function BulkCreatePanel({ project, time, current, commit, seek }: {
  project: ProjectSnapshot; time: number; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; seek: (id: string, time: number) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState("Name,Role\nAlex,Designer\nSam,Producer");
  const [rowFilter, setRowFilter] = useState<BulkRowFilter>({});
  const [pageFields, setPageFields] = useState<BulkPageFields>({});
  const [imageConnections, setImageConnections] = useState<BulkConnections>({});
  const [linkConnections, setLinkConnections] = useState<BulkConnections>({});
  const [connections, setConnections] = useState<BulkConnections>({});
  const [first, setFirst] = useState("1"), [last, setLast] = useState("");
  const [rowIndex, setRowIndex] = useState(0), [fieldPage, setFieldPage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const generation = useRef(0), generationBusy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { generation.current++; }, [source, first, last, connections, imageConnections, linkConnections, pageFields, rowFilter, time, project.id]);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ id: number; projectId: string; source: string; name: string } | null>(null);
  const request = useRef(0);
  useEffect(() => { request.current++; setPendingImport(null); return () => { request.current++; }; }, [project.id]);
  const parsed = useMemo(() => { try { return { data: parseBulkData(source), error: "" }; } catch (value) { return { data: null, error: value instanceof Error ? value.message : "Invalid spreadsheet data" }; } }, [source]);
  const imageFields = useMemo(() => bulkImageFields(project, time), [project, time]);
  const photoNames = useMemo(() => bulkPhotoNames(project), [project]);
  const linkFields = useMemo(() => bulkLinkFields(project, time), [project, time]);
  const fields = useMemo(() => bulkTemplateFields(project, time), [project, time]);
  const data = parsed.data, connected = data ? fields.filter(clip => bulkConnected(clip, data.headers, connections)) : [];
  const previewIndex = Math.min(rowIndex, (data?.rows.length ?? 1) - 1), previewRow = data?.rows[previewIndex];
  const end = Number(last || data?.rows.length || 0), page = Math.min(fieldPage, Math.max(0, Math.ceil(fields.length / 8) - 1));
  const selectedRows = useMemo(() => { try { return data ? bulkSelectedRows(data, Number(first), end, rowFilter) : []; } catch { return []; } }, [data, first, end, rowFilter]);
  const previewIncluded = selectedRows.includes(Math.min(rowIndex, (data?.rows.length ?? 1) - 1));
  const pagePreviewOptions = useMemo(() => data ? { data, row: previewIndex, time, connections, pageFields, linkConnections, imageConnections } : null, [data, rowIndex, time, connections, pageFields, linkConnections, imageConnections]);
  const connectionContext = useMemo(() => data ? { headers: data.headers, fields, images: imageFields, links: linkFields, connections, imageConnections, linkConnections, pageFields } : null, [data, fields, imageFields, linkFields, connections, imageConnections, linkConnections, pageFields]);
  const changeSource = (value: string) => { request.current++; setPendingImport(null); setFirst("1"); setSource(value); setMessage(""); setError(""); setRowIndex(0); setLast(""); setRowFilter({}); };
  const importFile = async () => {
    const token = ++request.current;
    let importedUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/tab-separated-values", "text/plain", "application/vnd.ms-excel"], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0]; importedUri = file?.uri;
      if (token !== request.current || current()?.id !== project.id) return;
      if (!file || !/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("Choose a CSV or TSV file");
      if ((file.size ?? 0) > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const info = await FileSystem.getInfoAsync(file.uri);
      if (info.exists && info.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await FileSystem.readAsStringAsync(file.uri);
      if (text.length > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      if (token === request.current && current()?.id === project.id) { setPendingImport({ id: token, projectId: project.id, source: text, name: file.name }); setError(""); }
    } catch (value) { if (token === request.current) setError(value instanceof Error ? value.message : "Could not read this file"); }
    finally { if (importedUri && FileSystem.cacheDirectory && importedUri.startsWith(FileSystem.cacheDirectory) && importedUri !== FileSystem.cacheDirectory) await FileSystem.deleteAsync(importedUri, { idempotent: true }).catch(() => {}); }
  };
  const generate = async () => {
    if (generationBusy.current) return; generationBusy.current = true; setGenerating(true); const token = ++generation.current;
    try {
      const latest = current(); if (!data || !latest || latest.id !== project.id) return;
      const expected = projectReviewSnapshotKey(latest), plan = planBulkPhotos(latest, time, data, Number(first), end, rowFilter, imageConnections);
      const media = await Promise.all(plan.mediaIds.map(id => getMedia(id)));
      if (token !== generation.current || !mounted.current) return;
      const before = current(); if (!before || before.id !== project.id || projectReviewSnapshotKey(before) !== expected) throw new Error("The design changed before pages could be generated. Try again with its current state");
      const sources = media.flatMap(source => source ? [source] : []);
      const result = createBulkPages(before, time, data, connections, Number(first), end, () => newId(10), pageFields, rowFilter, linkConnections, imageConnections, sources);
      commit(result.project);
      const firstClip = result.project.clips.find(clip => clip.kind !== "audio" && clip.start >= result.start); if (firstClip) seek(firstClip.id, result.start);
      setMessage(t("editor.bulk.created", { defaultValue: "Created {{count}} pages. Undo restores the original design.", count: result.count })); setError("");
    } catch (value) { if (token === generation.current && mounted.current) setError(value instanceof Error ? value.message : "Could not generate pages"); }
    finally { generationBusy.current = false; if (mounted.current) setGenerating(false); }
  };

  const button = (label: string, onPress: () => void, disabled = false, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white/15" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.bulk.hint", { defaultValue: "Use the current page as a template. Connect text and QR layers to spreadsheet columns, or put column names in double braces inside your text. Each selected row creates a new page; the original stays in place." })}</Text>
    {button(t("editor.bulk.import", { defaultValue: "Import CSV or TSV" }), () => { void importFile(); })}
    <Text className="text-xs text-white/45">{t("editor.bulk.limits", { defaultValue: "Up to 50 rows and 20 columns" })}</Text>
    <PasteDataImportControls bulk key={project.id} onPrepare={value => { const id = ++request.current; setPendingImport({ id, projectId: project.id, source: value, name: t("editor.dataImport.pastedName", { defaultValue: "pasted spreadsheet" }) }); setError(""); }} />
    {pendingImport && pendingImport.projectId === project.id && <DataImportMappingControls key={pendingImport.id} source={pendingImport.source} name={pendingImport.name} mode="bulk" defaultMultiple={false} defaultHeader onUse={result => { if (pendingImport.projectId === project.id) changeSource(result.source); }} onCancel={() => setPendingImport(null)} />}
    <TextInput multiline value={source} onChangeText={value => { request.current++; changeSource(value); }} maxLength={500000} accessibilityLabel={t("editor.bulk.data", { defaultValue: "Spreadsheet data with column headers" })} autoCorrect={false} autoCapitalize="none" textAlignVertical="top" className="min-h-[100px] rounded-lg border border-white/20 p-2 text-xs text-white" />
    {data && <>
      <Text className="text-xs text-white/60">{data.rows.length} {t("editor.bulk.rows", { defaultValue: "data rows" })}</Text>
      <View className="flex-row" style={{ gap: 10 }}><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t("editor.bulk.first", { defaultValue: "From row" })}</Text><TextInput value={first} onChangeText={setFirst} keyboardType="number-pad" accessibilityLabel={t("editor.bulk.first", { defaultValue: "From row" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t("editor.bulk.last", { defaultValue: "To row" })}</Text><TextInput value={last || String(data.rows.length)} onChangeText={setLast} keyboardType="number-pad" accessibilityLabel={t("editor.bulk.last", { defaultValue: "To row" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View></View>
      <BulkDataExportControls key={project.id} source={source} first={Number(first)} last={end} filter={rowFilter} title={project.title} count={selectedRows.length} />
      {connectionContext && <BulkConnectionFileControls key={project.id} context={connectionContext} title={project.title} onApply={value => { setConnections(value.connections); setImageConnections(value.imageConnections); setLinkConnections(value.linkConnections); setPageFields(value.pageFields); setMessage(""); setError(""); }} />}
      <BulkAutoConnectControls headers={data.headers} fields={fields} images={imageFields} connections={connections} imageConnections={imageConnections} onApply={value => { setConnections(value.connections); setImageConnections(value.images); setMessage(""); setError(""); }} />
      <BulkPlaceholderControls headers={data.headers} row={previewRow} />
      <BulkRowFilterControls headers={data.headers} value={rowFilter} onChange={value => { setRowFilter(value); setMessage(""); }} />
      <BulkPhotoConnectionsControls fields={imageFields} headers={data.headers} row={previewRow} value={imageConnections} onChange={value => { setImageConnections(value); setMessage(""); }} />
      <BulkPhotoNames names={photoNames} />
      <BulkLinkConnectionsControls fields={linkFields} headers={data.headers} row={previewRow} value={linkConnections} onChange={value => { setLinkConnections(value); setMessage(""); }} />
      <BulkPageFieldsControls headers={data.headers} row={previewRow} value={pageFields} onChange={value => { setPageFields(value); setMessage(""); }} />
      {!fields.length && <Text className="text-xs text-white/60">{t("editor.bulk.noText", { defaultValue: "Add an unlocked text or QR layer to this page to connect your data." })}</Text>}
      {fields.slice(page * 8, page * 8 + 8).map(clip => <View key={clip.id} className="rounded-lg border border-white/10 p-2" style={{ gap: 8 }}><Text numberOfLines={2} className="text-xs text-white/80">{clip.label || (clip.kind === "shape" ? "QR: " + bulkFieldText(clip) : bulkFieldText(clip)) || t("editor.bulk.emptyText", { defaultValue: "Empty text layer" })}</Text><ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{button(t("editor.bulk.placeholders", { defaultValue: "Use placeholders in text" }), () => setConnections(value => ({ ...value, [clip.id]: "" })), false, !connections[clip.id])}{data.headers.map(header => button(header, () => { setConnections(value => ({ ...value, [clip.id]: header })); setMessage(""); }, false, connections[clip.id] === header))}</ScrollView>{previewRow && <Text className="text-xs text-white/50">{bulkTextPreviewValue(clip, data.headers, previewRow, connections).slice(0, 500)}</Text>}</View>)}
      {fields.length > 8 && <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>{button(t("editor.bulk.previousLayers", { defaultValue: "Previous layers" }), () => setFieldPage(page - 1), page === 0)}<Text className="text-xs text-white/60">{page + 1} / {Math.ceil(fields.length / 8)}</Text>{button(t("editor.bulk.nextLayers", { defaultValue: "Next layers" }), () => setFieldPage(page + 1), (page + 1) * 8 >= fields.length)}</View>}
      <View style={{ gap: 6 }}><Text accessibilityLiveRegion="polite" className={previewIncluded ? "text-xs text-emerald-200" : "text-xs text-amber-200"}>{t(previewIncluded ? "editor.bulk.previewIncluded" : "editor.bulk.previewExcluded", { defaultValue: previewIncluded ? "This preview row is included in the batch." : "This preview row is outside the chosen range or filter." })}</Text>{!previewIncluded && selectedRows.length > 0 && button(t("editor.bulk.firstMatchingRecord", { defaultValue: "Preview first matching record" }), () => setRowIndex(selectedRows[0]))}</View>
      <Text className="text-xs text-white/60">{t("editor.bulk.preview", { defaultValue: "Preview data row" })} {previewIndex + 1}: {(previewRow?.[0] || "—").slice(0, 60)}</Text>
      <View className="flex-row" style={{ gap: 8 }}>{button(t("editor.bulk.previousRow", { defaultValue: "Previous row" }), () => setRowIndex(previewIndex - 1), previewIndex === 0)}{button(t("editor.bulk.nextRow", { defaultValue: "Next row" }), () => setRowIndex(previewIndex + 1), previewIndex + 1 >= data.rows.length)}</View>
      {pagePreviewOptions && <BulkPagePreview key={project.id} project={project} options={pagePreviewOptions} />}
      {button(t("editor.bulk.generate", { defaultValue: "Generate {{count}} pages", count: bulkSelectedCount(data, Number(first), end, rowFilter) }), generate, generating || !bulkSelectedCount(data, Number(first), end, rowFilter) || (!connected.length && !bulkPageFieldsConnected(data.headers, pageFields) && !linkFields.some(clip => data.headers.includes(linkConnections[clip.id])) && !imageFields.some(clip => data.headers.includes(imageConnections[clip.id]))) || !Number.isInteger(Number(first)) || Number(first) < 1 || !Number.isInteger(end) || end < Number(first) || end > data.rows.length)}
    </>}
    {(parsed.error || error) && <Text accessibilityRole="alert" className="text-xs text-red-300">{error || parsed.error}</Text>}
    {message && <Text accessibilityLiveRegion="polite" className="text-xs text-emerald-300">{message}</Text>}
  </View>;
}
