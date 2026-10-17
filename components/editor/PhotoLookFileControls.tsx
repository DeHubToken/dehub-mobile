import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { photoLookFile, parsePhotoLookFile } from "../../libs/editor/photoLooks";
import type { ClipEffects } from "../../libs/editor/types";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function PhotoLookFileControls({ value, title, onApply, disabled = false }: { value: ClipEffects; title: string; disabled?: boolean; onApply: (style: ClipEffects, name: string) => boolean | void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [pending, setPending] = useState<ReturnType<typeof parsePhotoLookFile> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), request = useRef(0), working = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  const act = async (load: boolean) => {
    if (working.current || !load && !value) return; working.current = true; setBusy(true); const token = ++request.current, abort = new AbortController(); controller.current = abort; let uri: string | undefined;
    try {
      if (load) {
        const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain"], copyToCacheDirectory: true, multiple: false }); if (result.canceled) return;
        const file = result.assets[0]; uri = file?.uri; if (token !== request.current || abort.signal.aborted) return; if (!file) throw new Error("Choose a photo-look JSON file");
        const info = await FileSystem.getInfoAsync(file.uri); if (!info.exists || info.isDirectory || info.size > 32768) throw new Error("Choose a photo-look file smaller than 32 KB");
        const parsed = parsePhotoLookFile(await FileSystem.readAsStringAsync(file.uri)); if (token === request.current && !abort.signal.aborted) { setPending(parsed); setMessage(""); }
      } else {
        if (!FileSystem.cacheDirectory || !value) throw new Error("Temporary file storage is unavailable");
        uri = FileSystem.cacheDirectory + `photo-look-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        await FileSystem.writeAsStringAsync(uri, photoLookFile(value, title), { encoding: FileSystem.EncodingType.UTF8 });
        await saveEditorDownload(uri, title + "-photo-look", "json", "application/json", abort.signal);
      }
      if (token === request.current && !abort.signal.aborted) setError("");
    } catch (reason) { if (token === request.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not transfer photo look"); }
    finally { if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) && uri !== FileSystem.cacheDirectory) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); working.current = false; if (controller.current === abort) controller.current = null; if (token === request.current) setBusy(false); }
  };
  const button = (key: string, label: string, press: () => void, disabled = busy) => <Pressable key={key} accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={press} style={{ opacity: disabled ? 0.35 : 1 }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.photoLooks.styleFiles", { defaultValue: "Transfer photo looks" })} {open ? "−" : "+"}</Text></Pressable>{open && <><View className="flex-row flex-wrap" style={{ gap: 6 }}>{button("save", t("editor.photoLooks.exportStyle", { defaultValue: "Export current look" }), () => { void act(false); }, busy || !value)}{button("load", t("editor.photoLooks.importStyle", { defaultValue: "Import look file" }), () => { void act(true); })}</View>{pending && <><Text className="text-xs text-white/75">{pending.name}</Text>{button("apply", t("editor.photoLooks.applyImportedStyle", { defaultValue: "Apply imported look" }), () => { if (disabled) return; if (onApply(pending.effects, pending.name) === false) return; setMessage(t("editor.photoLooks.styleLoaded", { defaultValue: "Imported look applied" })); setError(""); }, busy || disabled)}</>}<Text className="text-[10px] text-white/45">{t("editor.photoLooks.styleFileHint", { defaultValue: "Transfers colour, blur, duotone and detail adjustments between devices. Import shows its saved name; apply it to replace the selected media adjustments. Crop, frames, borders and timing stay in place." })}</Text>{!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{message}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</>}</View>;
}
