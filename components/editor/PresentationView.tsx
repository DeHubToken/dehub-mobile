import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getPages, pageAt } from "../../libs/editor/pages";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PresentationView({ project, time, renderPage, onClose, onPage }: {
  onPage: (time: number) => void;
  project: ProjectSnapshot; time: number; renderPage: (time: number) => Promise<string>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const pages = getPages(project.settings, project.clips);
  const [index, setIndex] = useState(() => pageAt(pages, time).index);
  const [notes, setNotes] = useState(false), [black, setBlack] = useState(false), [auto, setAuto] = useState(false), [seconds, setSeconds] = useState(5);
  const [uri, setUri] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)], details = project.settings.pageDetails?.[page.index];
  const cache = useRef(new Map<number, string>()), renderer = useRef(renderPage); renderer.current = renderPage;
  const pageChanged = useRef(onPage); pageChanged.current = onPage;
  useEffect(() => () => { cache.current.clear(); }, []);
  useEffect(() => {
    let active = true;
    const at = page.start + Math.min(0.6, (page.end - page.start) / 2);
    pageChanged.current(at);
    setBlack(false); setError(""); setUri(null);
    const cached = cache.current.get(page.index);
    if (cached) { setUri(cached); setLoading(false); return; }
    setLoading(true);
    void renderer.current(at).then(value => {
      if (!active) return;
      cache.current.set(page.index, value);
      while (cache.current.size > 3) cache.current.delete(cache.current.keys().next().value!);
      setUri(value); setLoading(false);
    }).catch(value => { if (active) { setError(value instanceof Error ? value.message : "Could not load this page"); setLoading(false); setAuto(false); } });
    return () => { active = false; };
  }, [page.index, page.start, page.end, attempt]);
  useEffect(() => {
    if (!auto || black || loading || !uri || error) return;
    if (page.index >= pages.length - 1) { setAuto(false); return; }
    const timer = setTimeout(() => setIndex(page.index + 1), seconds * 1000);
    return () => clearTimeout(timer);
  }, [auto, black, loading, uri, error, seconds, page.index, pages.length]);
  const button = (label: string, onPress: () => void, disabled = false, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} className={`min-h-[44px] items-center justify-center rounded-lg border px-3 ${active ? "border-white bg-white/15" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/80">{label}</Text></Pressable>;
  return <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={onClose}>
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: "#000000" }}>
      <View className="flex-row items-center px-3 py-2" style={{ gap: 10 }}><Text accessibilityLiveRegion="polite" numberOfLines={1} className="flex-1 text-sm text-white">{details?.title || t("editor.pages.page", { number: page.index + 1 })}</Text>{button(t("editor.present.close", { defaultValue: "Close presentation" }), onClose)}</View>
      <View style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
        {uri && <Image source={{ uri }} resizeMode="contain" accessibilityLabel={details?.title || t("editor.pages.page", { number: page.index + 1 })} style={{ width: "100%", height: "100%" }} />}
        {loading && <ActivityIndicator color="#ffffff" size="large" accessibilityLabel={t("editor.present.loading", { defaultValue: "Loading page" })} />}
        {error !== "" && <View className="items-center px-4" style={{ gap: 12 }}><Text accessibilityRole="alert" className="text-center text-sm text-red-300">{error}</Text>{button(t("editor.present.retry", { defaultValue: "Retry page" }), () => setAttempt(value => value + 1))}</View>}
        {black && <View accessibilityLabel={t("editor.present.blackout", { defaultValue: "Blackout" })} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#000000" }} />}
      </View>
      {notes && <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ padding: 14, gap: 8 }}><Text className="text-xs text-white/45">{t("editor.present.notes", { defaultValue: "Presenter notes" })}</Text><Text className="text-sm text-white/80">{details?.notes || t("editor.present.noNotes", { defaultValue: "No notes for this page" })}</Text></ScrollView>}
      <View className="border-t border-white/10 px-3 py-2" style={{ gap: 8 }}>
        <View className="flex-row items-center justify-center" style={{ gap: 12 }}>{button(t("editor.present.previous", { defaultValue: "Previous" }), () => setIndex(page.index - 1), loading || page.index === 0)}<Text className="text-xs text-white/50">{page.index + 1} / {pages.length}</Text>{button(t("editor.present.next", { defaultValue: "Next" }), () => setIndex(page.index + 1), loading || page.index === pages.length - 1)}</View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{button(t(auto ? "editor.present.stopAuto" : "editor.present.startAuto", { defaultValue: auto ? "Stop auto advance" : "Auto advance" }), () => { if (!auto && page.index === pages.length - 1) setIndex(0); setAuto(value => !value); }, loading, auto)}{[3, 5, 10, 15, 30, 60].map(value => button(`${value}s`, () => setSeconds(value), false, seconds === value))}</ScrollView>
        <View className="flex-row justify-center" style={{ gap: 8 }}>{button(t("editor.present.blackout", { defaultValue: "Blackout" }), () => setBlack(value => !value), false, black)}{button(t("editor.present.notes", { defaultValue: "Presenter notes" }), () => setNotes(value => !value), false, notes)}</View>
      </View>
    </SafeAreaView>
  </Modal>;
}
