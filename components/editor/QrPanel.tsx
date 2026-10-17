import * as Clipboard from "expo-clipboard";
import QrBrandPalettes from "./QrBrandPalettes";
import QrContentBuilder from "./QrContentBuilder";
import QrVectorDownload from "./QrVectorDownload";
import { useQrPreview } from "../../libs/editor/useQrPreview";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { newId } from "../../libs/editor/project";
import { QR_ERROR_CORRECTION, qrPreviewPath, putQrGraphic, type QrGraphic } from "../../libs/editor/qrGraphic";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function QrPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const selected = project.clips.find(c => c.id === selectedId);
  const qr = selected?.kind === "shape" ? selected.qr : undefined;
  const [content, setContent] = useState("https://dehub.io");
  const [foreground, setForeground] = useState("#000000"), [background, setBackground] = useState("#ffffff");
  const [correction, setCorrection] = useState<NonNullable<QrGraphic["errorCorrection"]>>("M"), [quietZone, setQuietZone] = useState(4);
  const preview = useQrPreview(content, foreground, background, correction, quietZone);
  const [error, setError] = useState(""), [draftEpoch, setDraftEpoch] = useState(0);
  const [copyMessage, setCopyMessage] = useState(""), copyGeneration = useRef(0);
  useEffect(() => { copyGeneration.current++; setCopyMessage(""); return () => { copyGeneration.current++; }; }, [content, selected?.id]);
  const copyContent = async () => { const request = ++copyGeneration.current; try { await Clipboard.setStringAsync(content); if (request === copyGeneration.current) { setCopyMessage(t("editor.qr.contentCopied", { defaultValue: "QR content copied" })); setError(""); } } catch { if (request === copyGeneration.current) { setCopyMessage(""); setError(t("editor.qr.copyFailed", { defaultValue: "Could not copy QR content" })); } } };
  const reset = () => { setContent(qr?.content ?? "https://dehub.io"); setForeground(qr?.foreground ?? "#000000"); setBackground(qr?.background ?? "#ffffff"); setCorrection(qr?.errorCorrection ?? "M"); setQuietZone(qr?.quietZone ?? 4); setError(""); setCopyMessage(""); setDraftEpoch(value => value + 1); };
  useEffect(() => { if (qr) { setContent(qr.content); setForeground(qr.foreground); setBackground(qr.background); setCorrection(qr.errorCorrection ?? "M"); setQuietZone(qr.quietZone ?? 4); } }, [selected?.id, qr]);
  const apply = () => {
    try {
      if (!preview.value) return;
      const before = current();
      if (!before || before.id !== project.id) return;
      const result = putQrGraphic(before, time, preview.value, () => newId(10), selectedId);
      if (result) { commit(result.project); select(result.id); setError(""); }
    } catch { setError(t("editor.qr.failed", { defaultValue: "Use shorter text and two different hex colours." })); }
  };
  return <View className="px-3" style={{ gap: 10 }}>
    <View className="items-center justify-center" style={{ minHeight: 160 }}>{preview.value ? <Svg width={160} height={160} viewBox={`0 0 ${preview.value.cells.length + quietZone * 2} ${preview.value.cells.length + quietZone * 2}`} accessible accessibilityLabel={t("editor.qr.preview", { defaultValue: "QR code preview" })}><Rect width="100%" height="100%" fill={preview.value.background} /><Path d={qrPreviewPath(preview.value)} fill={preview.value.foreground} /></Svg> : <Text accessibilityLiveRegion="polite" className="text-center text-xs text-white/50">{t(preview.pending ? "editor.qr.preparing" : "editor.qr.invalidPreview", { defaultValue: preview.pending ? "Preparing preview…" : "Use shorter text and two different hex colours, or choose a more compact correction level." })}</Text>}</View>
    <QrVectorDownload key={`${project.id}:${selectedId ?? "new"}`} value={preview.value} title={project.title} />
    <Text className="text-xs text-white/60">{t("editor.qr.hint", { defaultValue: "Create a QR code for a link or text. Keep strong contrast between the foreground and background." })}</Text>
    <QrBrandPalettes value={[foreground, background]} onChange={colours => { setForeground(colours[0]); setBackground(colours[1]); setError(""); }} />
    <QrContentBuilder key={`${selected?.id ?? "new"}:${draftEpoch}`} onUse={value => { setContent(value); setError(""); }} />
    <TextInput multiline value={content} onChangeText={setContent} maxLength={1500} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.qr.content", { defaultValue: "Link or text" })} className="min-h-[70px] rounded-lg border border-white/20 px-3 py-2 text-sm text-white" />
    <Text className="text-xs text-white/65">{t("editor.qr.correction", { defaultValue: "Error correction" })}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>{QR_ERROR_CORRECTION.map(level => <Pressable key={level} accessibilityRole="button" accessibilityState={{ selected: correction === level }} onPress={() => setCorrection(level)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${correction === level ? "border-white bg-white/15" : "border-white/20"}`}><Text className="text-xs text-white">{t(`editor.qr.level.${level}`, { defaultValue: ({ L: "Compact (L)", M: "Balanced (M)", Q: "Robust (Q)", H: "Maximum correction (H)" })[level] })}</Text></Pressable>)}</View>
    <Text className="text-xs text-white/65">{t("editor.qr.quietZone", { defaultValue: "Quiet zone (modules)" })}</Text><View className="flex-row" style={{ gap: 8 }}>{[4, 5, 6, 7, 8].map(size => <Pressable key={size} accessibilityRole="button" accessibilityState={{ selected: quietZone === size }} onPress={() => setQuietZone(size)} className={`min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border ${quietZone === size ? "border-white bg-white/15" : "border-white/20"}`}><Text className="text-xs text-white">{size}</Text></Pressable>)}</View>
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <TextInput value={foreground} onChangeText={setForeground} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.qr.foreground", { defaultValue: "Foreground" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" />
      <TextInput value={background} onChangeText={setBackground} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.qr.background", { defaultValue: "Background" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" />
      <Pressable accessibilityRole="button" disabled={!preview.value || !content.trim() || foreground === background || (!!qr && !!selected?.locked)} onPress={apply} className="min-h-[40px] justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t(qr ? "editor.qr.update" : "editor.qr.insert", { defaultValue: qr ? "Update QR code" : "Insert QR code" })}</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" disabled={!content.trim()} accessibilityState={{ disabled: !content.trim() }} onPress={() => { void copyContent(); }} style={{ opacity: content.trim() ? 1 : 0.35 }} className="min-h-[40px] self-start justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.qr.copyContent", { defaultValue: "Copy QR content" })}</Text></Pressable>
    {!!copyMessage && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{copyMessage}</Text>}
    <Pressable accessibilityRole="button" onPress={reset} className="min-h-[40px] self-start justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.qr.resetDraft", { defaultValue: "Reset QR draft" })}</Text></Pressable>
    {error !== "" && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
