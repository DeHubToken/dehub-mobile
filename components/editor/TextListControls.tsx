import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { DEFAULT_TEXT_LIST_STYLE, type TextListStyle } from "../../libs/editor/textList";
import type { TextClip } from "../../libs/editor/types";
const numbering: Record<TextListStyle["numbering"], string> = { decimal: "1. 2. 3.", "alpha-lower": "a. b. c.", "alpha-upper": "A. B. C.", "roman-lower": "i. ii. iii.", "roman-upper": "I. II. III." };
const bulletNames: Record<string, string> = { disc: "Filled circle", circle: "Hollow circle", square: "Square", dash: "Dash", check: "Check mark" };
const bullets: Record<TextListStyle["bullet"], string> = { disc: "•", circle: "◦", square: "▪", dash: "–", check: "✓" };
export default function TextListControls({ value, onChange }: { value: TextClip; onChange: (style: TextListStyle) => void }) {
  const { t } = useTranslation(), style = value.listStyle ?? DEFAULT_TEXT_LIST_STYLE;
  const [start, setStart] = useState(String(style.start));
  useEffect(() => setStart(String(style.start)), [value.id, style.start]);
  if (value.list !== "bullet" && value.list !== "number") return null;
  const maximum = style.numbering.startsWith("roman") ? 3999 : 9999;
  const button = (label: string, press: () => void, active: boolean, accessibilityLabel?: string) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: active, disabled: !!value.locked }} disabled={!!value.locked} onPress={press} className={`min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border px-3 ${active ? "border-cyan-300 bg-cyan-300/10" : "border-white/15"}`}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="rounded-lg border border-white/10 p-2" style={{ gap: 8 }}><View className="flex-row flex-wrap" style={{ gap: 6 }}>{value.list === "number" ? Object.entries(numbering).map(([key, label]) => button(label, () => onChange({ ...style, numbering: key as TextListStyle["numbering"], start: Math.min(style.start, key.startsWith("roman") ? 3999 : 9999) }), style.numbering === key)) : Object.entries(bullets).map(([key, label]) => button(label, () => onChange({ ...style, bullet: key as TextListStyle["bullet"] }), style.bullet === key, t(`editor.text.bullet.${key}`, { defaultValue: bulletNames[key] })))}</View>
    {value.list === "number" && <View className="flex-row items-center" style={{ gap: 8 }}><Text className="flex-1 text-xs text-white/60">{t("editor.text.listStart", { defaultValue: "Start numbering at" })}</Text><TextInput value={start} maxLength={4} keyboardType="number-pad" onChangeText={setStart} accessibilityLabel={t("editor.text.listStart", { defaultValue: "Start numbering at" })} className="min-h-[40px] w-20 rounded-lg border border-white/20 px-2 text-xs text-white" /><Pressable accessibilityRole="button" disabled={!!value.locked || !Number.isInteger(Number(start)) || Number(start) < 1 || Number(start) > maximum} onPress={() => onChange({ ...style, start: Number(start) })} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("common.apply", { defaultValue: "Apply" })}</Text></Pressable></View>}
  </View>;
}
