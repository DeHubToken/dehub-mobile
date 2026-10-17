import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { STROKE_PATTERNS, parseStrokePattern, strokePatternId } from "../../libs/editor/strokePatterns";
import type { TextStroke } from "../../libs/editor/types";

export default function StrokePatternControls({ stroke, onChange }: { stroke: TextStroke; onChange: (value: TextStroke) => void }) {
  const { t } = useTranslation(), pattern = strokePatternId(stroke.dash), key = (stroke.dash ?? []).join(" ");
  const [custom, setCustom] = useState(pattern === "custom"), [draft, setDraft] = useState(key), [offset, setOffset] = useState(String(stroke.dashOffset ?? 0)), [error, setError] = useState("");
  useEffect(() => { setCustom(strokePatternId(stroke.dash) === "custom"); setDraft(key); setOffset(String(stroke.dashOffset ?? 0)); }, [key, stroke.dashOffset]);
  const apply = () => { try { const dash = parseStrokePattern(draft), phase = Number(offset); if (!Number.isFinite(phase) || Math.abs(phase) > 10000) throw new Error("Use a dash offset between −10,000 and 10,000"); onChange({ ...stroke, dash, dashOffset: dash ? phase : undefined }); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the line pattern"); } };
  const button = (label: string, press: () => void, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={press} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View style={{ gap: 8 }}><Text className="text-xs text-white/65">{t("editor.outline.pattern", { defaultValue: "Line pattern" })}</Text><ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{STROKE_PATTERNS.map(value => button(t(`editor.outline.${value.id}`, { defaultValue: value.label }), () => { setCustom(false); onChange({ ...stroke, dash: value.dash.length ? [...value.dash] : undefined, dashOffset: undefined }); }, !custom && pattern === value.id))}{button(t("editor.outline.customPattern", { defaultValue: "Custom pattern" }), () => setCustom(value => !value), custom)}</ScrollView>
    {(custom || !!stroke.dash?.length) && <><Text className="text-xs text-white/65">{t("editor.outline.dashLengths", { defaultValue: "Dash and gap lengths" })}</Text><TextInput value={draft} maxLength={120} onChangeText={value => { setDraft(value); setCustom(true); }} autoCorrect={false} placeholder="16 12 4 12" placeholderTextColor="#888888" accessibilityLabel={t("editor.outline.dashLengths", { defaultValue: "Dash and gap lengths" })} className="min-h-[40px] rounded-lg border border-white/15 px-3 text-white" /><Text className="text-xs text-white/65">{t("editor.outline.dashOffset", { defaultValue: "Dash offset" })}</Text><TextInput value={offset} maxLength={20} onChangeText={setOffset} keyboardType="numbers-and-punctuation" accessibilityLabel={t("editor.outline.dashOffset", { defaultValue: "Dash offset" })} className="min-h-[40px] rounded-lg border border-white/15 px-3 text-white" />{button(t("editor.outline.applyPattern", { defaultValue: "Apply pattern" }), apply)}</>}
    {error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
