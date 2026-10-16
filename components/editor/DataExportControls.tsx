import React, { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Buffer } from "buffer";
import { useTranslation } from "react-i18next";
import { dataVisualExport } from "../../libs/editor/dataVisualExport";
import { openVideoExport } from "../../libs/editor/storage";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function DataExportControls({ source, mode, multiple, title }: { source: string; mode: "chart" | "table"; multiple: boolean; title: string }) {
  const { t } = useTranslation(), [formulasAsText, setFormulasAsText] = useState(true), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const mounted = useRef(true), working = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const action = async (copy: boolean) => {
    if (working.current) return; working.current = true; setBusy(true);
    try {
      const data = dataVisualExport(source, mode, multiple, copy ? "\t" : ",", formulasAsText);
      let completed = copy;
      if (copy) await Clipboard.setStringAsync(data);
      else {
        const out = openVideoExport(`${title || "design"}-data`, "csv");
        try { out.append(Buffer.from("\uFEFF" + data, "utf8").toString("base64")); out.close(); await saveEditorDownload(out.uri, `${title || "design"}-data`, "csv", "text/csv", undefined, () => { completed = true; }); }
        finally { out.discard(); }
      }
      if (mounted.current) { setError(""); setMessage(completed ? t(copy ? "editor.dataExport.copied" : "editor.dataExport.downloaded", { defaultValue: copy ? "Cells copied" : "CSV downloaded" }) : ""); }
    } catch (reason) { if (mounted.current) { setMessage(""); setError(reason instanceof Error ? reason.message : "Could not export this data"); } }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><View className="flex-row flex-wrap" style={{ gap: 8 }}>{([false, true] as const).map(copy => <Pressable key={String(copy)} accessibilityRole="button" disabled={busy || !source.trim()} onPress={() => { void action(copy); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: busy || !source.trim() ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t(copy ? "editor.dataExport.copyCells" : "editor.dataExport.csv", { defaultValue: copy ? "Copy cells" : "Download CSV" })}</Text></Pressable>)}</View><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={formulasAsText} onValueChange={setFormulasAsText} accessibilityLabel={t("editor.dataExport.formulasAsText", { defaultValue: "Treat formulas as text" })} /><Text className="flex-1 text-xs text-white/55">{t("editor.dataExport.formulasAsText", { defaultValue: "Treat formulas as text" })}</Text></View>{message && <Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{message}</Text>}{error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
