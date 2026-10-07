import React, { useState } from "react";
import { Platform, Pressable, Share, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";
import { exportSubtitles, parseSubtitles, subtitleClips, subtitleLayers, SUBTITLE_FORMATS, type SubtitleFormat } from "../../libs/editor/subtitles";

export default function SubtitleFilesPanel({ project, onAdd }: { project: ProjectSnapshot; onAdd: (layers: ReturnType<typeof subtitleLayers>) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const captions = subtitleClips(project.clips, project.tracks);
  const importFile = async () => {
    if (busy) return;
    setBusy(true); setStatus(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["text/*", "application/x-subrip"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (!info.exists || (asset.size ?? info.size ?? 0) > 2_000_000) throw new Error("subtitle file too large");
      const cues = parseSubtitles(await FileSystem.readAsStringAsync(asset.uri));
      if (!cues.length) throw new Error("no subtitle cues");
      onAdd(subtitleLayers(cues, newId));
      setStatus(t("editor.captions.done", { count: cues.length }));
    } catch { setStatus(t("editor.captions.failed")); }
    finally { setBusy(false); }
  };
  const download = async (format: SubtitleFormat) => {
    if (busy || !captions.length) return;
    setBusy(true); setStatus(null);
    const dir = FileSystem.cacheDirectory;
    const path = dir ? `${dir}subtitles-${newId()}.${format}` : null;
    try {
      const text = exportSubtitles(captions, format);
      if (Platform.OS === "android") {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, `subtitles.${format}`, format === "vtt" ? "text/vtt" : "application/x-subrip");
        await FileSystem.writeAsStringAsync(uri, text);
      } else {
        if (!path) throw new Error("sharing unavailable");
        await FileSystem.writeAsStringAsync(path, text);
        await Share.share({ url: path });
      }
    } catch { setStatus(t("common.somethingWentWrong")); }
    finally { if (path) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {}); setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void importFile(); }} className="rounded-xl bg-white px-4 py-3">
      <Text className="text-black">{t(busy ? "common.loading" : "common.select")} SRT / VTT</Text>
    </Pressable>
    <View className="flex-row" style={{ gap: 8 }}>
      {SUBTITLE_FORMATS.map(format => <Pressable key={format} accessibilityRole="button" disabled={busy || !captions.length} onPress={() => { void download(format); }} className="flex-1 rounded-xl border border-white/10 px-4 py-3" style={{ opacity: captions.length ? 1 : 0.4 }}>
        <Text className="text-white">{t("common.save")} {format.toUpperCase()}</Text>
      </Pressable>)}
    </View>
    {status && <Text className="text-theme-neutrals-400">{status}</Text>}
  </View>;
}
