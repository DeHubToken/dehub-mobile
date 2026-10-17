import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { bulkConnectionProfileFile, parseBulkConnectionProfile, planBulkConnectionProfile, type BulkConnectionContext, type BulkConnectionProfile } from "../../libs/editor/bulkConnectionProfiles";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
export default function BulkConnectionFileControls({ context, title, onApply }: { context: BulkConnectionContext; title: string; onApply: (value: ReturnType<typeof planBulkConnectionProfile>) => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [pending, setPending] = useState<BulkConnectionProfile | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), request = useRef(0), working = useRef(false), controller = useRef<AbortController | null>(null);
  const plan = useMemo(() => pending ? planBulkConnectionProfile(pending, context) : null, [pending, context]);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  const act = async (load: boolean) => {
    if (working.current) return; working.current = true; setBusy(true); const token = ++request.current, abort = new AbortController(); controller.current = abort; let uri: string | undefined;
    try {
      if (load) {
        const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain"], copyToCacheDirectory: true, multiple: false }); if (picked.canceled) return;
        const file = picked.assets[0]; uri = file?.uri; if (token !== request.current || abort.signal.aborted) return; if (!file) throw new Error("Choose an exported bulk connection setup");
        const info = await FileSystem.getInfoAsync(file.uri); if (!info.exists || info.isDirectory || info.size > 131072) throw new Error("Choose a connection setup smaller than 128 KB");
        const profile = parseBulkConnectionProfile(await FileSystem.readAsStringAsync(file.uri)); if (token === request.current && !abort.signal.aborted) { setPending(profile); setMessage(""); }
      } else {
        const text = bulkConnectionProfileFile(context, title); if (!FileSystem.cacheDirectory) throw new Error("Temporary file storage is unavailable");
        uri = FileSystem.cacheDirectory + `bulk-connections-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
        await saveEditorDownload(uri, title + "-bulk-connections", "json", "application/json", abort.signal);
      }
      if (token === request.current && !abort.signal.aborted) setError("");
    } catch (reason) { if (token === request.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not transfer connection setup"); }
    finally { if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) && uri !== FileSystem.cacheDirectory) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); working.current = false; if (controller.current === abort) controller.current = null; if (token === request.current) setBusy(false); }
  };
  const button = (key: string, label: string, onPress: () => void, disabled = busy) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ opacity: disabled ? 0.35 : 1 }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-medium text-white/75">{t("editor.bulk.connectionFiles", { defaultValue: "Transfer connection setup" })} {open ? "−" : "+"}</Text></Pressable>{open && <View style={{ gap: 12 }}><View className="flex-row flex-wrap" style={{ gap: 8 }}>{button("save", t("editor.bulk.exportConnections", { defaultValue: "Export current connections" }), () => { void act(false); })}{button("load", t("editor.bulk.importConnections", { defaultValue: "Import connection file" }), () => { void act(true); })}</View>{pending && plan && <><Text className="text-xs font-medium text-white/75">{pending.name}</Text><Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{t("editor.bulk.connectionPlan", { defaultValue: "{{matched}} matches; {{layers}} missing layers, {{columns}} missing columns, {{ambiguous}} ambiguous matches skipped", matched: plan.matched, layers: plan.missingLayers, columns: plan.missingColumns, ambiguous: plan.ambiguous })}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>{button("apply", t("editor.bulk.applyConnectionFile", { defaultValue: "Apply matching connections" }), () => { onApply(plan); setPending(null); setMessage(t("editor.bulk.connectionsLoaded", { defaultValue: "Matching connections loaded" })); setError(""); }, busy || !plan.matched)}{button("cancel", t("common.cancel", { defaultValue: "Cancel" }), () => setPending(null))}</View></>}<Text className="text-[10px] text-white/45">{t("editor.bulk.connectionFileHint", { defaultValue: "Transfers text, QR, photo, link and page-field connections by layer and column names. Matching connections replace their current mapping; other mappings stay. Name connected layers uniquely before exporting. Spreadsheet records and design artwork are not included." })}</Text>{!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{message}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>}</View>;
}
