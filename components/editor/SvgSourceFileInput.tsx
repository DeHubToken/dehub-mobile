import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
export default function SvgSourceFileInput({ onLoad }: { onLoad: (source: string, name: string) => void }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState(""), request = useRef(0), working = useRef(false);
  useEffect(() => () => { request.current++; }, []);
  const load = async () => {
    if (working.current) return; working.current = true; setBusy(true); const token = ++request.current; let uri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["image/svg+xml", "application/xml", "text/xml", "text/plain"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return; const file = result.assets[0]; uri = file?.uri; if (token !== request.current) return; if (!file) throw new Error("Choose an SVG file");
      const info = await FileSystem.getInfoAsync(file.uri); if (!info.exists || info.isDirectory || !info.size || info.size > 32768) throw new Error("Choose an SVG file smaller than 32 KB");
      const source = await FileSystem.readAsStringAsync(file.uri); if (token !== request.current) return; onLoad(source, file.name.replace(/\.svg$/i, "").trim().slice(0, 100) || "Imported vector"); setError("");
    } catch (reason) { if (token === request.current) setError(reason instanceof Error ? reason.message : "Could not read this SVG file"); }
    finally { if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) && uri !== FileSystem.cacheDirectory) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); working.current = false; if (token === request.current) setBusy(false); }
  };
  return <View style={{ gap: 4 }}><Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void load(); }} style={{ opacity: busy ? 0.35 : 1 }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.svgPath.chooseFile", { defaultValue: "Choose SVG file" })}</Text></Pressable>{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
