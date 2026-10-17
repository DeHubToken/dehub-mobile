import React, { useEffect, useRef, useState } from "react";
import { resizeComposition, RESIZE_ANCHORS, type ResizeContentMode } from "../../libs/editor/resizeComposition";
import { getMedia } from "../../libs/editor/storage";
import ResizeContentControls from "./ResizeContentControls";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { useDocumentSize } from "../../libs/editor/useDocumentSize";
import { DESIGN_UNITS, DOCUMENT_SIZE_PRESETS, dimensionDisplay, resizeDocument } from "../../libs/editor/documentDimensions";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function ResizeDesignPanel({ project, current, commit }: {
  project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void;
}) {
  const { t } = useTranslation();
  const { unit, dpi, width, height, locked, pixels, valid, setDpi, change, changeUnit, toggleLock, swap } = useDocumentSize(project.settings);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ResizeContentMode>("relative"), [anchor, setAnchor] = useState("centre"), [busy, setBusy] = useState(false);
  const mounted = useRef(true), resizing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const apply = async (w: number, h: number, resolution: number) => {
    if (resizing.current) return;
    resizing.current = true; setBusy(true);
    try {
      const latest = current(); if (!latest || latest.id !== project.id) return;
      const resized = resizeDocument(latest, w, h, resolution), sizes = new Map<string, { width: number; height: number }>();
      if (mode !== "relative" && (w !== latest.settings.width || h !== latest.settings.height)) {
        const ids = [...new Set(latest.clips.flatMap(clip => (clip.kind === "image" || clip.kind === "video") && !clip.isPageBackground ? [clip.mediaId] : []))];
        for (let offset = 0; offset < ids.length; offset += 16) {
          const entries = await Promise.all(ids.slice(offset, offset + 16).map(id => getMedia(id)));
          if (!mounted.current) return; if (current() !== latest) { setError(t("editor.resize.changed", { defaultValue: "The design changed while preparing sizes. Apply the size again." })); return; }
          for (const entry of entries) if (entry) sizes.set(entry.id, { width: entry.width, height: entry.height });
        }
      }
      if (!mounted.current) return; if (current() !== latest) { setError(t("editor.resize.changed", { defaultValue: "The design changed while preparing sizes. Apply the size again." })); return; }
      const next = resizeComposition(latest, resized, mode, RESIZE_ANCHORS.find(value => value.id === anchor) ?? RESIZE_ANCHORS[4], sizes);
      if (next !== latest) commit(next); setError("");
    } catch (value) { if (mounted.current) setError(value instanceof Error ? value.message : "Could not resize this design"); }
    finally { resizing.current = false; if (mounted.current) setBusy(false); }
  };
  const button = (label: string, onPress: () => void, active = false, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active, disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white/10" : "border-white/20"}`} style={{ opacity: disabled || busy ? 0.35 : 1 }}><Text className="text-xs text-white/80">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <ResizeContentControls mode={mode} anchor={anchor} onMode={setMode} onAnchor={setAnchor} disabled={busy} />
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{DOCUMENT_SIZE_PRESETS.map(size => <Pressable key={size.id} accessibilityRole="button" disabled={busy} onPress={() => { void apply(size.width, size.height, size.dpi); }} className="rounded-lg border border-white/15 p-3" style={{ gap: 4 }}><Text className="text-xs font-semibold text-white">{t(`editor.designTools.size.${size.id}`, { defaultValue: size.label })}</Text><Text className="text-xs text-white/45">{size.width} × {size.height} px</Text></Pressable>)}</ScrollView>
    <View className="flex-row" style={{ gap: 8 }}><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/65">{t("editor.resize.width", { defaultValue: "Width" })}</Text><TextInput editable={!busy} value={width} onChangeText={value => change("width", value)} keyboardType="decimal-pad" maxLength={24} accessibilityLabel={t("editor.resize.width", { defaultValue: "Width" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/65">{t("editor.resize.height", { defaultValue: "Height" })}</Text><TextInput editable={!busy} value={height} onChangeText={value => change("height", value)} keyboardType="decimal-pad" maxLength={24} accessibilityLabel={t("editor.resize.height", { defaultValue: "Height" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{DESIGN_UNITS.map(value => button(value, () => changeUnit(value), unit === value))}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(t("editor.resize.lockAspect", { defaultValue: "Lock aspect ratio" }), toggleLock, locked)}{button(t("editor.resize.swap", { defaultValue: "Swap dimensions" }), swap)}</View>
    <Text className="text-xs text-white/65">{t("editor.resize.dpi", { defaultValue: "Print resolution (pixels/inch)" })}</Text><TextInput editable={!busy} value={dpi} onChangeText={setDpi} keyboardType="number-pad" maxLength={3} accessibilityLabel={t("editor.resize.dpi", { defaultValue: "Print resolution (pixels/inch)" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <Text className="text-xs text-white/45">{valid ? `${pixels.width} × ${pixels.height} px · ${dimensionDisplay(pixels.width, "mm", Number(dpi))} × ${dimensionDisplay(pixels.height, "mm", Number(dpi))} mm` : t("editor.resize.range", { defaultValue: "Each side must resolve to 64–8,192 pixels. Print resolution must be 72–600." })}</Text>
    <Text className="text-xs text-white/45">{t("editor.resize.printHint", { defaultValue: "Print resolution sets the physical page size in PDF downloads. Existing measurements scale with the canvas." })}</Text>
    {button(t("editor.designTools.applySize", { defaultValue: "Apply size" }), () => apply(pixels.width, pixels.height, Number(dpi)), false, !valid)}
    {busy && <Text accessibilityLiveRegion="polite" className="text-xs text-white/55">{t("editor.resize.preparing", { defaultValue: "Preparing artwork dimensions…" })}</Text>}
    {error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
