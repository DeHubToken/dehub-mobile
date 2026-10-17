import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { gradientStyleFile, parseGradientStyleFile } from "../../libs/editor/gradientStyleFile";
import type { GradientFill } from "../../libs/editor/gradientFill";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function GradientStyleFileControls({ value, title, onApply }: { value: GradientFill | null; title: string; onApply: (style: GradientFill) => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [pending, setPending] = useState<ReturnType<typeof parseGradientStyleFile> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), request = useRef(0), working = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  const act = async (load: boolean) => {
    if (working.current || !load && !value) return; working.current = true; setBusy(true); const token = ++request.current, abort = new AbortController(); controller.current = abort; let uri: string | undefined;
    try {
      if (load) {
        const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain"], copyToCacheDirectory: true, multiple: false }); if (result.canceled) return;
        const file = result.assets[0]; uri = file?.uri; if (token !== request.current || abort.signal.aborted) return; if (!file) throw new Error("Choose a gradient-style JSON file");
        const info = await FileSystem.getInfoAsync(file.uri); if (!info.exists || info.isDirectory || info.size > 32768) throw new Error("Choose a gradient-style file smaller than 32 KB");
        const parsed = parseGradientStyleFile(await FileSystem.readAsStringAsync(file.uri)); if (token === request.current && !abort.signal.aborted) { setPending(parsed); setMessage(""); }
      } else {
        if (!FileSystem.cacheDirectory || !value) throw new Error("Temporary file storage is unavailable");
        uri = FileSystem.cacheDirectory + `gradient-style-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        await FileSystem.writeAsStringAsync(uri, gradientStyleFile(value, title), { encoding: FileSystem.EncodingType.UTF8 });
        await saveEditorDownload(uri, title + "-gradient-style", "json", "application/json", abort.signal);
      }
      if (token === request.current && !abort.signal.aborted) setError("");
    } catch (reason) { if (token === request.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not transfer gradient style"); }
    finally { if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) && uri !== FileSystem.cacheDirectory) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); working.current = false; if (controller.current === abort) controller.current = null; if (token === request.current) setBusy(false); }
  };
  const button = (key: string, label: string, press: () => void, disabled = busy) => <Pressable key={key} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={press} style={{ opacity: disabled ? 0.35 : 1 }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.gradients.styleFiles", { defaultValue: "Transfer gradient styles" })} {open ? "−" : "+"}</Text></Pressable>{open && <><View className="flex-row flex-wrap" style={{ gap: 6 }}>{button("save", t("editor.gradients.exportStyle", { defaultValue: "Export current style" }), () => { void act(false); }, busy || !value)}{button("load", t("editor.gradients.importStyle", { defaultValue: "Import style file" }), () => { void act(true); })}</View>{pending && <><Text className="text-xs text-white/75">{pending.name}</Text><View className="flex-row overflow-hidden rounded">{pending.style.stops.map((stop, index) => <View key={index} style={{ flex: 1, height: 20, backgroundColor: stop.colour }} />)}</View>{button("apply", t("editor.gradients.applyImportedStyle", { defaultValue: "Apply style to draft" }), () => { onApply(pending.style); setMessage(t("editor.gradients.styleLoaded", { defaultValue: "Style loaded into the draft" })); setError(""); })}</>}<Text className="text-[10px] text-white/45">{t("editor.gradients.styleFileHint", { defaultValue: "Transfers gradient colours, positions, transparency, angle and radial settings between devices. Import loads the draft; apply it to update artwork." })}</Text>{!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{message}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</>}</View>;
}
