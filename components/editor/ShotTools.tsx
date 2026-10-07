import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, ChipRow } from "./EditorPanels";
import { shotTime, type ShotAnalysis } from "../../libs/editor/shots";
import type { MediaClip } from "../../libs/editor/types";
import { toastError } from "../../libs";

export function ShotTools({ clip, detect, apply, preview }: { clip: MediaClip; detect: (clip: MediaClip, signal: AbortSignal, progress: (fraction: number) => void) => Promise<ShotAnalysis>; apply: (clip: MediaClip, times: number[]) => boolean; preview: (time: number) => void }) {
  const { t } = useTranslation(), controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null), [times, setTimes] = useState<number[] | null>(null), [chosen, setChosen] = useState<number[]>([]);
  useEffect(() => { setTimes(null); setChosen([]); return () => controller.current?.abort(); }, [clip]);
  const run = async () => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setProgress(0); setTimes(null);
    try { const result = await detect(clip, abort.signal, setProgress); if (!abort.signal.aborted) { setTimes(result.times); setChosen(result.times); } }
    catch { if (!abort.signal.aborted) toastError(t("common.somethingWentWrong")); }
    finally { if (controller.current === abort) { controller.current = null; setProgress(null); } }
  };
  return <View style={{ gap: 8 }}>
    <ChipRow><Chip label={t("editor.shots.detect")} active={false} disabled={progress !== null || !!clip.locked || !!clip.hidden || clip.duration > 600 || clip.duration < 0.8} onPress={() => void run()} /></ChipRow>
    <Text className="text-theme-neutrals-400 text-xs">{t("editor.shots.hint")}</Text>
    {progress !== null && <><Text className="text-theme-neutrals-300 text-xs">{t("common.loading")} {Math.round(progress * 100)}%</Text><ChipRow><Chip label={t("common.cancel")} active={false} onPress={() => controller.current?.abort()} /></ChipRow></>}
    {times && !times.length && <Text className="text-theme-neutrals-300 text-xs">{t("editor.shots.none")}</Text>}
    {times?.map(at => <View key={at} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Chip label={shotTime(at)} active={chosen.includes(at)} onPress={() => setChosen(old => old.includes(at) ? old.filter(value => value !== at) : [...old, at].sort((a,b) => a-b))} /><Pressable accessibilityRole="button" accessibilityLabel={t("editor.shots.preview")} onPress={() => preview(clip.start + at)}><Text className="text-theme-neutrals-300 text-xs">{t("editor.shots.preview")}</Text></Pressable></View>)}
    {!!times?.length && <ChipRow><Chip label={`${t("editor.shots.split")} (${chosen.length})`} active={false} disabled={!chosen.length || !!clip.locked} onPress={() => { if (!apply(clip, chosen)) toastError(t("common.somethingWentWrong")); }} /></ChipRow>}
  </View>;
}
