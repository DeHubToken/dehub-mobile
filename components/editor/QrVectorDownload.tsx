import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { qrSvgDocument } from "../../libs/editor/qrSvgDocument";
import type { QrGraphic } from "../../libs/editor/qrGraphic";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function QrVectorDownload({ value, title }: { value: QrGraphic | null; title: string }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState(""), working = useRef(false), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const download = async () => {
    if (!value || working.current) return; working.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort; let uri: string | undefined;
    try {
      if (!FileSystem.cacheDirectory) throw new Error("Temporary file storage is unavailable");
      const svg = qrSvgDocument(value); uri = FileSystem.cacheDirectory + `qr-vector-${Date.now()}-${Math.random().toString(36).slice(2)}.svg`;
      await FileSystem.writeAsStringAsync(uri, svg, { encoding: FileSystem.EncodingType.UTF8 });
      await saveEditorDownload(uri, (title || "QR code") + "-qr", "svg", "image/svg+xml", abort.signal);
      if (mounted.current) setError("");
    } catch (reason) { if (mounted.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not download QR code"); }
    finally { if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); if (controller.current === abort) controller.current = null; working.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={{ gap: 4 }}><Pressable accessibilityRole="button" accessibilityState={{ disabled: !value || busy, busy }} disabled={!value || busy} onPress={() => { void download(); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: !value || busy ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t("editor.qr.downloadSvg", { defaultValue: "Download QR as SVG" })}</Text></Pressable><Text className="text-[10px] text-white/45">{t("editor.qr.vectorHint", { defaultValue: "Exports the current QR draft with its colours and quiet zone as scalable vector artwork." })}</Text>{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
