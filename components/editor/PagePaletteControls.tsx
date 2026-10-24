import SavePalettePreset from "./SavePalettePreset";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { extractDesignPagePalette } from "../../libs/editor/extractDesignPagePalette";
import { applyDesignPalette } from "../../libs/editor/designTools";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PagePaletteControls({ project, time, current, commit, onPick, canPick }: { project: ProjectSnapshot; time: number; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; canPick: boolean; onPick: (colour: string) => void }) {
  const { t } = useTranslation(), [colours, setColours] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { pending.current?.abort(); pending.current = null; setColours([]); setBusy(false); setError(""); return () => { pending.current?.abort(); pending.current = null; }; }, [project.id, time]);
  const extract = async () => {
    const snapshot = current(); if (!snapshot || snapshot.id !== project.id) return;
    pending.current?.abort(); const request = new AbortController(); pending.current = request; setBusy(true); setError("");
    try { const result = await extractDesignPagePalette(snapshot, time, request.signal); if (!request.signal.aborted && pending.current === request && current()?.id === snapshot.id) setColours(result); }
    catch (reason) { if (!request.signal.aborted && pending.current === request) setError(reason instanceof Error ? reason.message : "Could not extract page colours"); }
    finally { if (pending.current === request) { pending.current = null; setBusy(false); } }
  };
  return <View className="rounded-lg border border-white/15 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={extract} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: busy ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t(busy ? "editor.palette.extracting" : "editor.palette.extractPage", { defaultValue: busy ? "Extracting colours…" : "Extract current page colours" })}</Text></Pressable>{!!colours.length && <><View className="flex-row flex-wrap" style={{ gap: 8 }}>{colours.map(colour => <Pressable key={colour} accessibilityRole="button" disabled={!canPick} accessibilityState={{ disabled: !canPick }} accessibilityLabel={t("editor.palette.useColour", { defaultValue: "Use {{colour}}", colour })} onPress={() => onPick(colour)} className="rounded-lg border border-white/20 p-1" style={{ gap: 4 }}><View style={{ backgroundColor: colour, height: 32, width: 56, borderRadius: 4 }} /><Text className="text-[10px] text-white/65">{colour}</Text></Pressable>)}</View><Pressable accessibilityRole="button" onPress={() => { const latest = current(); if (latest?.id === project.id) commit(applyDesignPalette(latest, colours)); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.palette.applyDesign", { defaultValue: "Apply palette to design" })}</Text></Pressable><SavePalettePreset colours={colours} /></>}<Text className="text-xs text-white/45">{!canPick && t("editor.palette.chooseTarget", { defaultValue: "Choose a document colour first to use a swatch as its replacement. " })}{t("editor.palette.extractionHint", { defaultValue: "Samples the current page, including photos. Choose a swatch as the replacement colour, or apply the palette to editable colours throughout the design." })}</Text>{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
