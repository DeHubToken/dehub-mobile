import PresentationRehearsal from "./PresentationRehearsal";
import type { RehearsedPageTiming } from "../../libs/editor/usePresentationRehearsal";
import PresentationNotes from "./PresentationNotes";
import PresentationStopwatch from "./PresentationStopwatch";
import { presentationPages } from "../../libs/editor/pageDetails";
import { usePresentationAutoAdvance } from "../../libs/editor/usePresentationAutoAdvance";
import PresentationMarkup, { PresentationMarkupTools } from "./PresentationMarkup";
import { usePresentationMarkup } from "../../libs/editor/usePresentationMarkup";
import PresentationPagePicker from "./PresentationPagePicker";
import { designPageLinkIndex, normaliseDesignLink, type DesignPdfLink } from "../../libs/editor/designLinks";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Keyboard, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { pageAt, pagePreviewTime } from "../../libs/editor/pages";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PresentationView({ project, time, renderPage, onClose, onPage, onApplyTimings }: {
  onApplyTimings: (entries: RehearsedPageTiming[]) => void;
  onPage: (time: number) => void;
  project: ProjectSnapshot; time: number; renderPage: (time: number) => Promise<{ dataUrl: string; links: DesignPdfLink[] }>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { pages, all: allPages, allHidden } = presentationPages(project);
  const [index, setIndex] = useState(() => { const current = pageAt(allPages, time).index; const position = pages.findIndex(page => page.index >= current); return position < 0 ? pages.length - 1 : position; });
  const [pagePicker, setPagePicker] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [pageTiming, setPageTiming] = useState(false), [loop, setLoop] = useState(false), [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => { const subscription = AppState.addEventListener("change", value => setForeground(value === "active")); return () => subscription.remove(); }, []);
  const [notes, setNotes] = useState(false), [black, setBlack] = useState(false), [white, setWhite] = useState(false), [auto, setAuto] = useState(false), [seconds, setSeconds] = useState(5);
  const [uri, setUri] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const position = Math.min(index, pages.length - 1), page = pages[position], details = project.settings.pageDetails?.[page.index];
  const nextPage = pages[position + 1] ?? (loop ? pages[0] : null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const markup = usePresentationMarkup(String(page.index));
  useEffect(() => { if (notes || pagePicker || markup.tool !== "none") setControlsVisible(true); }, [notes, pagePicker, markup.tool]);
  const toggleControls = () => { if (controlsVisible) { setNotes(false); setPagePicker(false); markup.setTool("none"); } setControlsVisible(!controlsVisible); };
  const [links, setLinks] = useState<DesignPdfLink[]>([]), [area, setArea] = useState({ w: 0, h: 0 });
  const displayScale = Math.min(area.w / project.settings.width, area.h / project.settings.height);
  const imageW = project.settings.width * displayScale, imageH = project.settings.height * displayScale;
  const cache = useRef(new Map<number, { dataUrl: string; links: DesignPdfLink[] }>()), renderer = useRef(renderPage); renderer.current = renderPage;
  const pageChanged = useRef(onPage); pageChanged.current = onPage;
  useEffect(() => () => { cache.current.clear(); }, []);
  useEffect(() => {
    let active = true;
    const at = page.start + Math.min(0.6, (page.end - page.start) / 2);
    pageChanged.current(at);
    setBlack(false); setWhite(false); setError(""); setUri(null); setLinks([]);
    const cached = cache.current.get(page.index);
    if (cached) { setUri(cached.dataUrl); setLinks(cached.links); setLoading(false); return; }
    setLoading(true);
    void renderer.current(at).then(value => {
      if (!active) return;
      cache.current.set(page.index, value);
      while (cache.current.size > 3) cache.current.delete(cache.current.keys().next().value!);
      setUri(value.dataUrl); setLinks(value.links); setLoading(false);
    }).catch(value => { if (active) { setError(value instanceof Error ? value.message : "Could not load this page"); setLoading(false); setAuto(false); } });
    return () => { active = false; };
  }, [page.index, page.start, page.end, attempt]);
  const clock = usePresentationAutoAdvance({ identity: `${page.index}:${cycle}`, enabled: auto, paused: black || white || notes || pagePicker || !foreground || loading || !uri || !!error,
    duration: pageTiming ? page.end - page.start : seconds,
    onAdvance: () => { if (position < pages.length - 1) setIndex(position + 1); else if (loop) { setIndex(0); setCycle(value => value + 1); } else setAuto(false); } });
  const button = (label: string, onPress: () => void, disabled = false, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} className={`min-h-[44px] items-center justify-center rounded-lg border px-3 ${active ? "border-white bg-white/15" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/80">{label}</Text></Pressable>;
  return <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={onClose}>
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: "#000000" }}>
      <View className="flex-row flex-wrap items-center px-3 py-2" style={{ gap: 10 }}><Text accessibilityLiveRegion="polite" numberOfLines={1} className="flex-1 text-sm text-white">{details?.title || t("editor.pages.page", { number: page.index + 1 })}</Text>{button(t(controlsVisible ? "editor.present.hideControls" : "editor.present.showControls", { defaultValue: controlsVisible ? "Hide controls" : "Show controls" }), toggleControls)}{button(t("editor.present.close", { defaultValue: "Close presentation" }), onClose)}</View>
      <View accessibilityElementsHidden={!controlsVisible || notes} importantForAccessibility={controlsVisible && !notes ? "auto" : "no-hide-descendants"} style={{ display: controlsVisible && !notes ? "flex" : "none" }}><PresentationStopwatch foreground={foreground} /></View>
      <View accessibilityElementsHidden={!controlsVisible || notes} importantForAccessibility={controlsVisible && !notes ? "auto" : "no-hide-descendants"} style={{ display: controlsVisible && !notes ? "flex" : "none" }}><PresentationRehearsal pageIndex={page.index} active={foreground && !pagePicker && !loading && !!uri && !error} onStart={() => setAuto(false)} onApply={onApplyTimings} /></View>
      {allHidden && <Text accessibilityLiveRegion="polite" className="px-4 py-2 text-center text-xs text-amber-200">{t("editor.present.allHidden", { defaultValue: "All pages are hidden. Showing the first page for this presentation." })}</Text>}
      <View onLayout={event => setArea({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
        {uri && <Image source={{ uri }} resizeMode="contain" accessibilityLabel={details?.title || t("editor.pages.page", { number: page.index + 1 })} style={{ width: "100%", height: "100%" }} />}
        {!black && !white && !loading && uri && imageW > 0 && <View pointerEvents="box-none" style={{ position: "absolute", left: (area.w - imageW) / 2, top: (area.h - imageH) / 2, width: imageW, height: imageH }}>{links.map((link, linkIndex) => <Pressable key={`${page.index}:${linkIndex}`} accessibilityRole="link" accessibilityLabel={designPageLinkIndex(link.url) === null ? link.url : t("editor.links.openPage", { defaultValue: "Go to page {{number}}", number: designPageLinkIndex(link.url)! + 1 })} onPress={() => { const target = designPageLinkIndex(link.url); if (target !== null) { const destination = pages.findIndex(page => page.index === target); if (destination >= 0) { setAuto(false); setIndex(destination); } } else { const url = normaliseDesignLink(link.url); if (url) void Linking.openURL(url).catch(() => { setError(t("editor.links.openFailed", { defaultValue: "Could not open this link" })); }); } }} style={{ position: "absolute", left: link.x * imageW, top: link.y * imageH, width: link.width * imageW, height: link.height * imageH }} />)}<PresentationMarkup markup={markup} width={imageW} height={imageH} onStart={() => setAuto(false)} /></View>}
        {loading && <ActivityIndicator color="#ffffff" size="large" accessibilityLabel={t("editor.present.loading", { defaultValue: "Loading page" })} />}
        {error !== "" && <View className="items-center px-4" style={{ gap: 12 }}><Text accessibilityRole="alert" className="text-center text-sm text-red-300">{error}</Text>{button(t("editor.present.retry", { defaultValue: "Retry page" }), () => setAttempt(value => value + 1))}</View>}
        {(black || white) && <View accessibilityLabel={t(white ? "editor.present.whiteScreen" : "editor.present.blackout", { defaultValue: white ? "White screen" : "Blackout" })} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: white ? "#ffffff" : "#000000" }} />}
      </View>
      {controlsVisible && pagePicker && <PresentationPagePicker count={allPages.length} allowedIndexes={pages.map(page => page.index)} current={page.index} details={project.settings.pageDetails} onPick={index => { Keyboard.dismiss(); setAuto(false); const destination = pages.findIndex(page => page.index === index); if (destination >= 0) setIndex(destination); setPagePicker(false); }} />}
      {controlsVisible && notes && <PresentationNotes upcoming={nextPage ? { project, time: pagePreviewTime(nextPage), index: nextPage.index, title: project.settings.pageDetails?.[nextPage.index]?.title ?? "" } : null} active={foreground} notes={details?.notes || ""} pageKey={String(page.index)} onClose={() => setNotes(false)} />}
      {controlsVisible && auto && <View className="flex-row items-center border-t border-white/10 px-4 py-2" style={{ gap: 12 }}><View accessibilityRole="progressbar" accessibilityLabel={t("editor.present.pageProgress", { defaultValue: "Page progress" })} accessibilityValue={{ min: 0, max: 100, now: Math.round(clock.progress * 100) }} style={{ height: 3, flex: 1, borderRadius: 2, backgroundColor: "#ffffff26", overflow: "hidden" }}><View style={{ width: `${clock.progress * 100}%`, height: 3, backgroundColor: "#67e8f9" }} /></View><Text className="text-right text-xs text-white/55" style={{ minWidth: 36, fontVariant: ["tabular-nums"] }}>{Math.ceil(clock.remaining)}s</Text></View>}
      {controlsVisible && !notes && <PresentationMarkupTools markup={markup} onStart={() => setAuto(false)} />}
      {controlsVisible && <View className="border-t border-white/10 px-3 py-2" style={{ gap: 8 }}>
        <View className="flex-row items-center justify-center" style={{ gap: 12 }}>{button(t("editor.present.previous", { defaultValue: "Previous" }), () => setIndex(position - 1), loading || position === 0)}<Text className="text-xs text-white/50">{page.index + 1} / {allPages.length}</Text>{button(t("editor.present.next", { defaultValue: "Next" }), () => setIndex(position + 1), loading || position === pages.length - 1)}</View>
        {!notes && <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{button(t(auto ? "editor.present.stopAuto" : "editor.present.startAuto", { defaultValue: auto ? "Stop auto advance" : "Auto advance" }), () => { if (!auto && position === pages.length - 1) setIndex(0); setAuto(value => !value); }, loading, auto)}{button(t("editor.present.usePageTiming", { defaultValue: "Use page durations" }), () => setPageTiming(value => !value), false, pageTiming)}{button(t("editor.present.loop", { defaultValue: "Loop presentation" }), () => setLoop(value => !value), false, loop)}{!pageTiming && [3, 5, 10, 15, 30, 60].map(value => button(`${value}s`, () => setSeconds(value), false, seconds === value))}</ScrollView>}
        {!notes && <View className="flex-row flex-wrap justify-center" style={{ gap: 8 }}>{button(t("editor.present.browsePages", { defaultValue: "Pages" }), () => { Keyboard.dismiss(); setNotes(false); setAuto(false); setPagePicker(value => !value); }, false, pagePicker)}{button(t("editor.present.blackout", { defaultValue: "Blackout" }), () => { setWhite(false); setBlack(value => !value); }, false, black)}{button(t("editor.present.whiteScreen", { defaultValue: "White screen" }), () => { setBlack(false); setWhite(value => !value); }, false, white)}{button(t("editor.present.notes", { defaultValue: "Presenter notes" }), () => { Keyboard.dismiss(); setPagePicker(false); setNotes(value => !value); }, false, notes)}</View>}
      </View>}
      {!controlsVisible && <View className="flex-row items-center justify-center border-t border-white/10 px-3 py-1" style={{ gap: 12 }}>{button(t("editor.present.previous", { defaultValue: "Previous" }), () => setIndex(position - 1), loading || position === 0)}<Text className="text-xs text-white/50">{page.index + 1} / {allPages.length}</Text>{button(t("editor.present.next", { defaultValue: "Next" }), () => setIndex(position + 1), loading || position === pages.length - 1)}</View>}
    </SafeAreaView>
  </Modal>;
}
