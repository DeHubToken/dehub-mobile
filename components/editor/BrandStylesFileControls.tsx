import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Buffer } from "buffer";
import { useTranslation } from "react-i18next";
import { brandStylesFile, parseBrandStylesFile, type BrandStylesFile } from "../../libs/editor/brandStylesFile";
import type { BrandStyles } from "../../libs/editor/brandStyles";
import { openVideoExport } from "../../libs/editor/storage";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";

export default function BrandStylesFileControls({ value, name, onImport }: { value: BrandStyles; name: string; onImport: (file: BrandStylesFile) => void }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const active = useRef(true), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const action = async (importing: boolean) => {
    if (working.current) return; working.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (importing) {
        const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
        if (picked.canceled) return; const file = picked.assets[0];
        try {
          if (!active.current) return;
          const info = await FileSystem.getInfoAsync(file.uri);
          if (!/\.json$/i.test(file.name) || !info.exists || info.isDirectory || info.size > 32768) throw new Error("Choose a JSON brand styles file smaller than 32 KB");
          const result = parseBrandStylesFile(await FileSystem.readAsStringAsync(file.uri)); if (!active.current) return;
          onImport(result); setMessage(t("editor.brand.fileLoaded", { defaultValue: "Imported colours and fonts. Save them as a named style or apply them to this design." }));
        } finally { if (FileSystem.cacheDirectory && file.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }
      } else {
        const text = brandStylesFile(name, value), out = openVideoExport(name || "Brand styles", "json"); let saved = false;
        try { out.append(Buffer.from(text, "utf8").toString("base64")); out.close(); await saveEditorDownload(out.uri, name || "Brand styles", "json", "application/json", undefined, () => { saved = true; }); }
        finally { out.discard(); }
        if (saved && active.current) setMessage(t("editor.brand.fileDownloaded", { defaultValue: "Brand styles file downloaded" }));
      }
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Could not transfer brand styles"); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const filled = value.colors.length > 0 || !!value.headingFont || !!value.bodyFont;
  return <View style={{ gap: 8 }}><View className="flex-row flex-wrap" style={{ gap: 8 }}>{[true, false].map(importing => <Pressable key={String(importing)} accessibilityRole="button" accessibilityState={{ disabled: busy || !importing && !filled }} disabled={busy || !importing && !filled} onPress={() => { void action(importing); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: busy || !importing && !filled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t(importing ? "editor.brand.importFile" : "editor.brand.exportFile", { defaultValue: importing ? "Import styles file" : "Download styles file" })}</Text></Pressable>)}</View><Text className="text-[10px] text-white/45">{t("editor.brand.fileHint", { defaultValue: "Transfer named colours and font pairs between devices. Images and logos stay in the design." })}</Text>{!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{message}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
