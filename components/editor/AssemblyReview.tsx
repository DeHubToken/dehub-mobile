import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { assemblyDuration, type AssemblyState, type AssemblySession } from "../../libs/editor/assembly";
import { shotTime } from "../../libs/editor/shots";

export default function AssemblyReview({ state, session, changed, names, onPreview, onCreate, onClose }: {
  state: AssemblyState; session: AssemblySession; changed: boolean; names: Record<string, string>;
  onPreview: (index: number) => void; onCreate: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!state.sourceId) return null;
  const disabled = state.busy || changed;
  const label = (id: string) => { const c = [...state.media, ...state.sounds].find(c => c.id === id); return c ? names[c.mediaId] || t(c.kind === "image" ? "editor.app.photo" : c.kind === "audio" ? "editor.video.sound" : "editor.video.video") : id; };
  const errors = { selectMedia: "editor.video.emptyTimeline", limit: "editor.shots.hint", changed: "editor.agent.failed", failed: "common.somethingWentWrong" };
  const button = (text: string, action: () => void, blocked = disabled, identity = text) => <Pressable key={identity} accessibilityRole="button" accessibilityLabel={text} disabled={blocked} onPress={() => { if (!blocked) action(); }} className="rounded-lg border border-white/20 px-2 py-1" style={{ opacity: blocked ? 0.4 : 1 }}><Text className="text-white text-xs">{text}</Text></Pressable>;
  return <View className="rounded-xl border border-white/15 p-3" style={{ gap: 10 }}>
    <Text className="text-white text-sm font-medium">{t("easyTrade.reviewTitle")} · {t("editor.video.video")}</Text>
    <Text className="text-theme-neutrals-300 text-xs">{t("editor.export.duration", { value: Number.isFinite(assemblyDuration(state)) ? assemblyDuration(state).toFixed(2) : "—" })}</Text>
    {(changed || state.error) && <Text accessibilityLiveRegion="polite" className="text-theme-neutrals-300 text-xs">{t(changed ? "editor.agent.failed" : errors[state.error!])}</Text>}
    {state.media.map(c => <Pressable key={c.id} accessibilityRole="checkbox" accessibilityLabel={label(c.id)} accessibilityState={{ checked: state.shots.some(s => s.id === c.id), disabled }} disabled={disabled} onPress={() => session.toggle(c.id)} className="flex-row items-center" style={{ gap: 8 }}><Text className="text-white">{state.shots.some(s => s.id === c.id) ? "✓" : "□"}</Text><Text numberOfLines={1} className="flex-1 text-white text-xs">{label(c.id)}</Text></Pressable>)}
    {state.shots.map((s, index) => <View key={s.id} className="border-t border-white/10 pt-2" style={{ gap: 6 }}>
      <Text numberOfLines={1} className="text-white text-xs">{index + 1}. {label(s.id)}</Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {button(`${t("editor.menu.bringForward")} ${index + 1}`, () => session.move(index, -1), disabled || index === 0)}
        {button(`${t("editor.menu.sendBackward")} ${index + 1}`, () => session.move(index, 1), disabled || index + 1 === state.shots.length)}
        {button(`${t("common.delete")} ${index + 1}`, () => session.toggle(s.id))}
      </View>
      <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
        <Text className="text-theme-neutrals-300 text-xs">{t("editor.shots.preview")}</Text>
        <NumericValue value={s.offset} label={`${t("editor.shots.preview")} ${index + 1}`} disabled={disabled} commit={value => session.range(s.id, value, s.duration)} />
        <Text className="text-theme-neutrals-300 text-xs">{t("filters.duration")}</Text>
        <NumericValue value={s.duration} label={`${t("filters.duration")} ${index + 1}`} disabled={disabled} commit={value => session.range(s.id, s.offset, value)} />
      </View>
      {button(`${t("editor.shots.preview")} ${shotTime(s.offset)}–${shotTime(s.offset + s.duration)}`, () => onPreview(index))}
    </View>)}
    <Text className="text-theme-neutrals-300 text-xs">{t("editor.video.transition")}</Text>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(`${state.transition === null ? "✓ " : ""}${t("editor.video.none")}`, () => session.transition(null))}{button(`${state.transition === "fade" ? "✓ " : ""}${t("editor.video.tFade")}`, () => session.transition("fade"))}</View>
    <Text className="text-theme-neutrals-300 text-xs">{t("editor.video.sound")}</Text>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(`${state.soundId === null ? "✓ " : ""}${t("editor.video.none")}`, () => session.sound(null))}{state.sounds.map(c => button(`${state.soundId === c.id ? "✓ " : ""}${label(c.id)}`, () => session.sound(c.id), disabled, c.id))}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {state.undo && button(t("common.undo"), () => session.undo())}
      {button(t(state.busy ? "common.loading" : "nav.create"), onCreate, disabled || !state.shots.length || assemblyDuration(state) > 600 || state.error === "limit")}
      {button(t("common.cancel"), onClose, false)}
    </View>
  </View>;
}

function NumericValue({ value, label, disabled, commit }: { value: number; label: string; disabled: boolean; commit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number.isFinite(value) && (!text.trim() || Number(text.replace(",", ".")) !== value)) setText(String(value)); }, [value]);
  return <TextInput accessibilityLabel={label} editable={!disabled} keyboardType="decimal-pad" value={text} onChangeText={next => { setText(next); commit(/^\d+(?:[.,]\d*)?$/.test(next) ? Number(next.replace(",", ".")) : NaN); }} className="rounded-lg border border-white/20 px-2 py-1 text-white" style={{ minWidth: 60 }} />;
}
