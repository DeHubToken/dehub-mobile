import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Page } from "../../libs/editor/pages";
export default function ScenesPanel({ pages, current, onPick, onAdd, onDelete, onMove, onDuration, details }: { details?: import("../../libs/editor/pageDetails").PageDetails[]; pages: Page[]; current: number; onPick: (start: number) => void; onAdd: (duplicate: boolean) => void; onDelete: (index: number) => void; onMove?: (from: number, to: number) => void; onDuration?: (index: number, seconds: number) => void }) {
  const { t } = useTranslation();
  const seconds = pages[current].end - pages[current].start;
  const [duration, setDuration] = useState(String(Number(seconds.toFixed(2))));
  useEffect(() => setDuration(String(Number(seconds.toFixed(2)))), [seconds, current]);
  const [query, setQuery] = useState(""), [jump, setJump] = useState("");
  const [windowStart, setWindowStart] = useState(0);
  useEffect(() => { setWindowStart(Math.floor(current / 24) * 24); setQuery(""); }, [current]);
  const needle = query.trim().toLowerCase();
  const matchingPages = needle ? pages.filter(page => `${page.index + 1} ${details?.[page.index]?.title ?? ""}`.toLowerCase().includes(needle)) : pages;
  const firstVisible = Math.min(windowStart, Math.max(0, Math.floor((matchingPages.length - 1) / 24) * 24));
  const visiblePages = matchingPages.slice(firstVisible, firstVisible + 24);
  return <View style={{ gap: 12 }}>
    <Text className="text-white">{t("editor.pages.position", { current: current + 1, total: pages.length })}</Text>
    {onDuration && <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text className="flex-1 text-xs text-white/60">{t("editor.pages.duration", { defaultValue: "Page duration" })}</Text>
      <TextInput accessibilityLabel={t("editor.pages.duration", { defaultValue: "Page duration" })} value={duration} onChangeText={setDuration} keyboardType="decimal-pad" className="min-h-[40px] w-20 rounded-lg border border-white/20 px-3 text-white" /><Text className="text-xs text-white/60">s</Text>
      <Pressable accessibilityRole="button" disabled={!Number.isFinite(Number(duration)) || Number(duration) < 0.1 || Number(duration) > 3600} onPress={() => onDuration(current, Number(duration))} className="min-h-[40px] justify-center rounded-lg bg-white/10 px-3"><Text className="text-xs text-white">{t("common.apply", { defaultValue: "Apply" })}</Text></Pressable>
    </View>}
    {pages.length > 24 && <View style={{ gap: 8 }}>
      <TextInput value={query} onChangeText={value => { setQuery(value); setWindowStart(0); }} placeholder={t("editor.pages.search", { defaultValue: "Find page by number or name" })} placeholderTextColor="#888888" accessibilityLabel={t("editor.pages.search", { defaultValue: "Find page by number or name" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" disabled={firstVisible === 0} onPress={() => setWindowStart(firstVisible - 24)} className="min-h-[40px] justify-center rounded-lg bg-white/10 px-3" style={{ opacity: firstVisible === 0 ? 0.35 : 1 }}><Text className="text-xs text-white">{t("editor.pages.previousSet", { defaultValue: "Previous pages" })}</Text></Pressable>
        <Text accessibilityLiveRegion="polite" className="text-xs text-white/50">{matchingPages.length ? firstVisible + 1 : 0}–{Math.min(firstVisible + 24, matchingPages.length)} / {matchingPages.length}</Text>
        <Pressable accessibilityRole="button" disabled={firstVisible + 24 >= matchingPages.length} onPress={() => setWindowStart(firstVisible + 24)} className="min-h-[40px] justify-center rounded-lg bg-white/10 px-3" style={{ opacity: firstVisible + 24 >= matchingPages.length ? 0.35 : 1 }}><Text className="text-xs text-white">{t("editor.pages.nextSet", { defaultValue: "Next pages" })}</Text></Pressable>
      </View>
      <View className="flex-row items-center" style={{ gap: 8 }}><Text className="text-xs text-white/60">{t("editor.pages.jump", { defaultValue: "Go to page" })}</Text><TextInput value={jump} onChangeText={setJump} keyboardType="number-pad" accessibilityLabel={t("editor.pages.jump", { defaultValue: "Go to page" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-white" /><Pressable accessibilityRole="button" disabled={!Number.isInteger(Number(jump)) || !pages[Number(jump) - 1]} onPress={() => { const page = pages[Number(jump) - 1]; if (page) { onPick(page.start); setJump(""); } }} className="min-h-[40px] justify-center rounded-lg bg-white/10 px-3"><Text className="text-xs text-white">{t("editor.pages.go", { defaultValue: "Go" })}</Text></Pressable></View>
    </View>}
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {visiblePages.map(page => <Pressable key={page.index} accessibilityRole="button" accessibilityState={{ selected: page.index === current }}
        onPress={() => onPick(page.start)} className={`rounded-xl px-4 py-3 ${page.index === current ? "bg-white" : "bg-white/10"}`}>
        <Text className={page.index === current ? "text-black" : "text-white"}>{details?.[page.index]?.title || t("editor.pages.page", { number: page.index + 1 })}</Text>
      </Pressable>)}
      {!visiblePages.length && <Text className="text-xs text-white/50">{t("editor.pages.noResults", { defaultValue: "No matching pages" })}</Text>}
    </View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => onAdd(false)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.add")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onAdd(true)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.duplicate")}</Text></Pressable>
      {pages.length > 1 && <Pressable accessibilityRole="button" onPress={() => onDelete(current)} className="rounded-xl bg-white/10 px-3 py-2"><Text className="text-white">{t("editor.pages.delete")}</Text></Pressable>}
    </View>
    {onMove && pages.length > 1 && <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: current === 0 }} disabled={current === 0} onPress={() => onMove(current, current - 1)} className="rounded-xl bg-white/10 px-3 py-3" style={{ opacity: current === 0 ? 0.35 : 1 }}><Text className="text-white">{t("editor.pages.moveEarlier", { defaultValue: "Move page earlier" })}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: current === pages.length - 1 }} disabled={current === pages.length - 1} onPress={() => onMove(current, current + 1)} className="rounded-xl bg-white/10 px-3 py-3" style={{ opacity: current === pages.length - 1 ? 0.35 : 1 }}><Text className="text-white">{t("editor.pages.moveLater", { defaultValue: "Move page later" })}</Text></Pressable>
    </View>}
  </View>;
}
