import React, { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { bulkDataExport, type BulkDataExportScope } from "../../libs/editor/bulkDataExport";
import type { BulkRowFilter } from "../../libs/editor/bulkRowFilter";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function BulkDataExportControls({ source, first, last, filter, title, count }: { source: string; first: number; last: number; filter: BulkRowFilter; title: string; count: number }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [formulas, setFormulas] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), working = useRef(false), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const action = async (scope: BulkDataExportScope, copy = false) => {
    if (working.current) return; working.current = true; setBusy(true); setMessage(""); setError(""); const abort = new AbortController(); controller.current = abort; let uri: string | undefined;
    try {
      const content = bulkDataExport(source, scope, first, last, filter, copy ? "\t" : ",", formulas);
      if (copy) await Clipboard.setStringAsync(content);
      else {
        if (!FileSystem.cacheDirectory) throw new Error("Temporary file storage is unavailable");
        uri = FileSystem.cacheDirectory + `bulk-data-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`;
        await FileSystem.writeAsStringAsync(uri, "\uFEFF" + content, { encoding: FileSystem.EncodingType.UTF8 });
        await saveEditorDownload(uri, (title || "Data") + (scope === "headers" ? "-bulk-template" : scope === "batch" ? "-batch-data" : "-bulk-data"), "csv", "text/csv", abort.signal);
      }
      if (mounted.current && !abort.signal.aborted) { setError(""); setMessage(copy ? t("editor.bulk.cellsCopied", { defaultValue: "Batch cells copied" }) : ""); }
    } catch (reason) { if (mounted.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not export spreadsheet data"); }
    finally { if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); working.current = false; if (controller.current === abort) controller.current = null; if (mounted.current) setBusy(false); }
  };
  const button = (key: string, label: string, press: () => void, disabled: boolean) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press} style={{ opacity: disabled ? 0.35 : 1 }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/65">{label}</Text></Pressable>;
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.bulk.exportData", { defaultValue: "Export spreadsheet data" })} {open ? "−" : "+"}</Text></Pressable>{open && <><View className="flex-row flex-wrap" style={{ gap: 6 }}>{(["all", "batch", "headers"] as const).map(scope => button(scope, t(`editor.bulk.csvScope.${scope}`, { defaultValue: ({ all: "All records CSV", batch: "Batch records CSV", headers: "Header template CSV" })[scope] }), () => { void action(scope); }, busy || scope === "batch" && !count))}{button("copy", t("editor.bulk.copyBatch", { defaultValue: "Copy batch cells" }), () => { void action("batch", true); }, busy || !count)}</View><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={formulas} onValueChange={setFormulas} accessibilityLabel={t("editor.dataExport.formulasAsText", { defaultValue: "Treat formulas as text" })} /><Text className="flex-1 text-xs text-white/55">{t("editor.dataExport.formulasAsText", { defaultValue: "Treat formulas as text" })}</Text></View>{!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{message}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</>}</View>;
}
