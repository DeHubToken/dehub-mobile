import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Buffer } from "buffer";
import { useTranslation } from "react-i18next";
import { parseReusableElementFile, reusableElementFile, type ReusableDesignElement } from "../../libs/editor/reusableElements";
import type { DesignClipboard } from "../../libs/editor/designClipboard";
import { openVideoExport } from "../../libs/editor/storage";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";

export default function ReusableElementFileControls({ element, onImport, disabled = false }: { element?: ReusableDesignElement; onImport?: (name: string, source: DesignClipboard) => void; disabled?: boolean }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(true), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const action = async () => {
    if (disabled || working.current) return; working.current = true; setBusy(true); setError("");
    try {
      if (!element) {
        if (!onImport) return;
        const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
        if (picked.canceled) return; const file = picked.assets[0];
        try {
          if (!active.current) return; const info = await FileSystem.getInfoAsync(file.uri);
          if (!/\.json$/i.test(file.name) || !info.exists || info.isDirectory || info.size > 800000) throw new Error("Choose a JSON element file smaller than 800 KB");
          const result = parseReusableElementFile(await FileSystem.readAsStringAsync(file.uri)); if (active.current) onImport(result.name, result.source);
        } finally { if (FileSystem.cacheDirectory && file.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }
      } else {
        const text = reusableElementFile(element.name, element.source), out = openVideoExport(element.name + "-element", "json");
        try { out.append(Buffer.from(text, "utf8").toString("base64")); out.close(); await saveEditorDownload(out.uri, element.name + "-element", "json", "application/json"); }
        finally { out.discard(); }
      }
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Could not transfer this element"); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  return <View style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={busy || disabled} accessibilityState={{ disabled: busy || disabled }} onPress={() => { void action(); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: busy || disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t(element ? "editor.elements.downloadFile" : "editor.elements.importFile", { defaultValue: element ? "Download element file" : "Import element file" })}</Text></Pressable>{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
