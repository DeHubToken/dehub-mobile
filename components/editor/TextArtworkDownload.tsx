import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function TextArtworkDownload({ getContent, disabled = false, title, label, hint, suffix = "", extension, mime }: { getContent: (signal: AbortSignal) => string | Promise<string>; disabled?: boolean; title: string; label: string; hint: string; suffix?: string; extension: "svg" | "vcf" | "ics"; mime: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), working = useRef(false), controller = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const download = async () => {
    if (disabled || working.current) return; working.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort; let uri: string | undefined;
    try {
      if (!FileSystem.cacheDirectory) throw new Error("Temporary file storage is unavailable");
      const content = await getContent(abort.signal); if (abort.signal.aborted) return; uri = FileSystem.cacheDirectory + `design-artwork-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
      await saveEditorDownload(uri, (title || "Design artwork") + suffix, extension, mime, abort.signal);
      if (mounted.current) setError("");
    } catch (reason) { if (mounted.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not download this file"); }
    finally { if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); if (controller.current === abort) controller.current = null; working.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={{ gap: 4 }}><Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={() => { void download(); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled || busy ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable><Text className="text-[10px] text-white/45">{hint}</Text>{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
