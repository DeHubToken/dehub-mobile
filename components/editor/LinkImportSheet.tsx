import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as FileSystem from "expo-file-system/legacy";
import { downloadEditorImport, getConverterImport, queueConverterImport } from "../../services/converter.service";
import { linkImportProgress } from "../../libs/editor/linkImport";
import { probeGeneratedMedia } from "../../libs/editor/generatedMediaProbe";
import { importClipFile } from "../../libs/editor/storage";
import { toastError, toastSuccess } from "../../libs/toast";

type Imported = Awaited<ReturnType<typeof importClipFile>>;
const POLL_MS = 2500;

/** Paste a YouTube, TikTok or other link; the clip lands in the project's media. */
export function LinkImportSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (media: Imported) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [owned, setOwned] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current++; }, []);
  const busy = status !== null;

  const start = async () => {
    const link = url.trim();
    if (!link || !owned || busy) return;
    const id = ++run.current;
    setStatus(t("editor.linkImport.queued"));
    let file: string | null = null;
    try {
      const kind = audioOnly ? "audio" : "video";
      const { jobId } = await queueConverterImport({ url: link, ownershipConfirmed: true, destination: "editor", mediaKind: kind });
      for (;;) {
        await new Promise(r => setTimeout(r, POLL_MS));
        if (id !== run.current) return;
        const job = await getConverterImport(jobId);
        const progress = linkImportProgress(job);
        if (progress.kind === "failed") throw new Error(job.failedReason || t("editor.linkImport.failed"));
        if (progress.kind === "done") {
          setStatus(t("editor.linkImport.adding"));
          const meta = job.result?.editorFile;
          const fileName = meta?.fileName || `import-${jobId}.${kind === "audio" ? "mp3" : "mp4"}`;
          file = await downloadEditorImport(jobId, fileName);
          const dimensions = await probeGeneratedMedia(file, kind);
          const media = await importClipFile({ uri: file, ...dimensions, mimeType: meta?.mimeType || (kind === "audio" ? "audio/mpeg" : "video/mp4"), fileName, kind });
          if (id !== run.current) return;
          onAdd(media);
          toastSuccess(t("editor.linkImport.added"));
          setUrl(""); onClose();
          return;
        }
        setStatus(progress.kind === "waiting" ? t("editor.linkImport.waiting") : t("editor.linkImport.downloading", { percent: progress.percent }));
      }
    } catch (error) {
      if (id === run.current) toastError(error instanceof Error && error.message ? error.message : t("editor.linkImport.failed"));
    } finally {
      if (file) await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
      if (id === run.current) setStatus(null);
    }
  };

  const close = () => { run.current++; setStatus(null); onClose(); };
  const check = (on: boolean, label: string, toggle: () => void) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: busy }} disabled={busy} onPress={toggle} className="flex-row items-start gap-2 py-1.5">
      <Text className="text-white">{on ? "☑" : "☐"}</Text><Text className="flex-1 text-xs text-white/75">{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={close} accessibilityRole="button" accessibilityLabel={t("common.close")}>
        <Pressable className="rounded-t-2xl border border-white/10 bg-theme-neutrals-900 p-4 pb-8" onPress={() => {}}>
          <Text className="mb-3 text-base font-semibold text-white">{t("editor.linkImport.open")}</Text>
          <TextInput value={url} onChangeText={setUrl} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="url"
            placeholder={t("editor.linkImport.placeholder")} placeholderTextColor="rgba(255,255,255,0.4)" accessibilityLabel={t("editor.linkImport.placeholder")}
            className="rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-white" onSubmitEditing={() => void start()} />
          {check(owned, t("editor.linkImport.rights"), () => setOwned(v => !v))}
          {check(audioOnly, t("editor.linkImport.audioOnly"), () => setAudioOnly(v => !v))}
          <Pressable accessibilityRole="button" disabled={!url.trim() || !owned || busy} onPress={() => void start()}
            className={`mt-2 flex-row items-center justify-center gap-2 rounded-xl py-3 ${!url.trim() || !owned || busy ? "bg-white/30" : "bg-white"}`}>
            {busy && <ActivityIndicator size="small" color="#000" />}
            <Text className="text-sm font-semibold text-black">{status ?? t("editor.linkImport.go")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
