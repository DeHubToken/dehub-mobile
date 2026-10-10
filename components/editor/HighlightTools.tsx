import { useDraftState } from "../../hooks/useDraftState";
import { findVisualHighlights } from "../../libs/editor/visualHighlights";
import { analyseVisualHighlights } from "../../libs/editor/visualHighlightApi";
import { reviewHighlights } from "../../libs/editor/highlightReview";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, ChipRow } from "./EditorPanels";
import type { EditorCanvasHandle } from "./EditorCanvas";
import { askSceneAgent } from "../../libs/editor/agent";
import { findHighlights, highlightCaptionWords, sameHighlightSource, type HighlightRange } from "../../libs/editor/highlights";
import { shotTime } from "../../libs/editor/shots";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";
import { toastError, toastSuccess } from "../../libs";

export function HighlightTools({ clip, current, transcribe, sampleVisual, create, preview }: {
  clip: MediaClip;
  current: () => ProjectSnapshot | null;
  transcribe: EditorCanvasHandle["transcribe"];
  sampleVisual: EditorCanvasHandle["sampleVisual"];
  create: (original: ProjectSnapshot, clipId: string, ranges: HighlightRange[], title: string) => Promise<boolean>;
  preview: (start: number, end: number) => void;
}) {
  const { t } = useTranslation(), controller = useRef<AbortController | null>(null), source = useRef<ProjectSnapshot | null>(null);
  const draftScope = `highlights:${current()?.id}:${clip.id}`;
  const [seconds, setSeconds] = useState(30), [focus, setFocus] = useDraftState(`${draftScope}:focus`, "");
  const [useVisual, setUseVisual] = useState(false);
  const [useCaptions, setUseCaptions] = useState(false), [progress, setProgress] = useState<string | null>(null);
  const [ranges, setRanges] = useState<HighlightRange[] | null>(null), [chosen, setChosen] = useState<number[]>([]), [applying, setApplying] = useState(false);
  const [reviewDraft, setReviewDraft] = useDraftState(`${draftScope}:review`, ""), [reviewEntries, setReviewEntries] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [reviewUndo, setReviewUndo] = useState<number[] | null>(null);
  useEffect(() => { setReviewEntries([]); setReviewUndo(null); }, [ranges]);
  const project = current(), hasCaptions = !!project && highlightCaptionWords(project, clip).length > 0;
  const isCurrent = (original: ProjectSnapshot) => { const now = current(); return !!now && sameHighlightSource(original, now); };
  useEffect(() => { setRanges(null); setChosen([]); source.current = null; return () => controller.current?.abort(); }, [clip, seconds, focus, useCaptions, useVisual]);
  const run = async () => {
    const original = current(); if (!original || controller.current) return;
    const abort = new AbortController(); controller.current = abort; source.current = original; setRanges(null); setProgress(t("common.loading"));
    try {
      let result: HighlightRange[];
      if (useVisual) {
        result = await findVisualHighlights(clip, { optIn: true, seconds, focus }, sampleVisual,
          (batch, signal) => {
            if (!isCurrent(original)) throw new Error("design changed");
            return analyseVisualHighlights(batch, signal);
          }, abort.signal, fraction => setProgress(`${t("editor.highlights.ranking")} ${Math.round(fraction * 100)}%`));
      } else {
        const words = useCaptions ? highlightCaptionWords(original, clip) : await transcribe(clip, p => setProgress(t(p.stage === "download" ? "editor.captions.downloading" : "editor.captions.working", { percent: Math.round(p.fraction * 100) })), abort.signal);
        if (abort.signal.aborted || !isCurrent(original)) return;
        setProgress(t("editor.highlights.ranking"));
        result = await findHighlights(clip, words, { seconds, focus }, askSceneAgent, abort.signal);
      }
      if (!abort.signal.aborted && isCurrent(original)) { setRanges(result); setChosen(result.map((_, i) => i)); }
    } catch (error) {
      if (!abort.signal.aborted) { console.warn("[editor] highlights failed", error); toastError(t(error instanceof Error && error.message === "highlight_limit" ? (useVisual ? "editor.highlights.chatLimit" : "editor.highlights.limit") : "common.somethingWentWrong")); }
    } finally { if (controller.current === abort) { controller.current = null; setProgress(null); } }
  };
  const review = async () => {
    const prompt = reviewDraft.trim(), original = source.current;
    if (!prompt || !original || !ranges?.length || controller.current || applying) return;
    if (!isCurrent(original)) { toastError(t("editor.highlights.changed")); return; }
    const abort = new AbortController(); controller.current = abort;
    const previous = [...chosen]; setProgress(t("editor.highlights.ranking"));
    setReviewEntries(old => [...old, { role: "user" as const, content: prompt }].slice(-8));

    try {
      const selection = await reviewHighlights(ranges, chosen, prompt, askSceneAgent, abort.signal);
      if (!abort.signal.aborted && isCurrent(original)) {
        setReviewDraft.complete(reviewDraft, "");
        setReviewUndo(previous); setChosen(selection);
        setReviewEntries(old => [...old, { role: "assistant" as const, content: t("editor.highlights.reviewResult", { count: selection.length, total: ranges.length }) }].slice(-8));
      } else if (!abort.signal.aborted) toastError(t("editor.highlights.changed"));
    } catch (error) {
      if (!abort.signal.aborted) {
        console.warn("[editor] highlight review failed", error);
        setReviewEntries(old => [...old, { role: "assistant" as const, content: t("editor.highlights.reviewFailed") }].slice(-8));
      }
    } finally { if (controller.current === abort) { controller.current = null; setProgress(null); } }
  };
  const apply = async () => {
    if (!source.current || !ranges || applying) return;
    setApplying(true);
    try {
      if (!await create(source.current, clip.id, ranges.filter((_, i) => chosen.includes(i)), t("editor.highlights.projectTitle", { title: source.current.title }))) toastError(t("editor.highlights.changed"));
      else toastSuccess(t("editor.highlights.created"));
    } catch { toastError(t("common.somethingWentWrong")); }
    finally { setApplying(false); }
  };
  return <View style={{ gap: 8 }}>
    <Text className="text-theme-neutrals-100 text-sm">{t("editor.highlights.title")}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Switch accessibilityLabel={t("editor.highlights.visual")} value={useVisual} disabled={progress !== null || applying} onValueChange={setUseVisual} /><Text className="text-theme-neutrals-300 text-xs">{t("editor.highlights.visual")}</Text></View>
    <Text className="text-theme-neutrals-400 text-xs">{t(useVisual ? "editor.highlights.visualPrivacy" : "editor.highlights.privacy")}</Text>
    <ChipRow>{[15, 30, 60].map(value => <Chip key={value} label={`${value}s`} active={seconds === value} disabled={progress !== null} onPress={() => setSeconds(value)} />)}</ChipRow>
    <TextInput className="border border-theme-neutrals-600 rounded-lg px-3 py-2 text-theme-neutrals-100 text-sm" accessibilityLabel={t("editor.highlights.focus")} placeholder={t("editor.highlights.focus")} placeholderTextColor="#9ca3af" maxLength={240} value={focus} editable={progress === null} onChangeText={setFocus} />
    {!useVisual && hasCaptions && <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Switch accessibilityLabel={t("editor.highlights.useCaptions")} value={useCaptions} disabled={progress !== null} onValueChange={setUseCaptions} /><Text className="text-theme-neutrals-300 text-xs">{t("editor.highlights.useCaptions")}</Text></View>}
    {!useVisual && hasCaptions && useCaptions && <Text className="text-theme-neutrals-400 text-xs">{t("editor.highlights.captionHint")}</Text>}
    <ChipRow><Chip label={t("editor.highlights.find")} active={false} disabled={progress !== null || applying || !!clip.locked || !!clip.hidden || clip.duration * (clip.speed ?? 1) > 600 || clip.duration < 1 || (useVisual && clip.duration > 600)} onPress={() => void run()} /></ChipRow>
    {progress !== null && <><Text className="text-theme-neutrals-300 text-xs">{progress}</Text><ChipRow><Chip label={t("common.cancel")} active={false} onPress={() => controller.current?.abort()} /></ChipRow></>}
    {ranges && !ranges.length && <Text className="text-theme-neutrals-300 text-xs">{t(useVisual ? "follow.noResults" : "editor.highlights.none")}</Text>}
    {ranges?.map((range, i) => <View key={`${range.start}-${range.end}`} style={{ gap: 4 }}>
      <ChipRow><Chip label={`${i + 1}. ${shotTime(range.start)}–${shotTime(range.end)}`} disabled={progress !== null || applying} active={chosen.includes(i)} onPress={() => setChosen(old => old.includes(i) ? old.filter(value => value !== i) : [...old, i])} /></ChipRow>
      <Text className="text-theme-neutrals-400 text-xs" numberOfLines={3}>{range.text}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t("editor.shots.preview")} disabled={progress !== null || applying} onPress={() => preview(clip.start + range.start, clip.start + range.end)}><Text className="text-theme-neutrals-200 text-xs">{t("editor.shots.preview")}</Text></Pressable>
    </View>)}
    {!!ranges?.length && <View style={{ gap: 8 }}>
      <Text className="text-theme-neutrals-100 text-sm">{t("editor.highlights.reviewTitle")}</Text>
      <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>{reviewEntries.map((entry, i) => <Text key={i} className={entry.role === "user" ? "text-theme-neutrals-100 text-xs" : "text-theme-neutrals-400 text-xs"}>{entry.content}</Text>)}</View>
      <TextInput multiline maxLength={800} className="border border-theme-neutrals-600 rounded-lg px-3 py-2 text-theme-neutrals-100 text-sm" accessibilityLabel={t("editor.highlights.reviewPlaceholder")} placeholder={t("editor.highlights.reviewPlaceholder")} placeholderTextColor="#9ca3af" value={reviewDraft} editable={progress === null && !applying} onChangeText={setReviewDraft} />
      <ChipRow><Chip label={t("editor.agent.send")} disabled={!reviewDraft.trim() || progress !== null || applying} onPress={() => void review()} />{reviewUndo && <Chip label={t("editor.highlights.undoSelection")} disabled={progress !== null || applying} onPress={() => { setChosen(reviewUndo); setReviewUndo(null); }} />}</ChipRow>
    </View>}
    {!!ranges?.length && <ChipRow><Chip label={`${t("editor.highlights.create")} (${chosen.length})`} active={false} disabled={!chosen.length || applying || progress !== null} onPress={() => void apply()} /></ChipRow>}
  </View>;
}
