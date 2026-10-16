import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, ChipRow, Range, Swatches, Toggle } from "./EditorPanels";
import { PEN_PRESETS, type PenSettings } from "../../libs/editor/freehand";

export default function PenControls({ value, onChange, refineOnly = false }: { value: PenSettings; onChange: (value: PenSettings) => void; refineOnly?: boolean }) {
  const { t } = useTranslation();
  return <View style={{ gap: 10 }}>
    {!refineOnly && <><ChipRow>{PEN_PRESETS.map(preset => <Chip key={preset.id} label={t(`editor.brush.${preset.id}`, { defaultValue: preset.label })} onPress={() => onChange({ ...value, ...preset.style, dash: [...preset.style.dash] })} />)}</ChipRow><Swatches label={t("editor.draw.colour")} value={value.color} onPick={color => onChange({ ...value, color })} /><Range label={t("editor.draw.width", { value: value.width })} value={value.width} min={2} max={60} step={1} onLive={width => onChange({ ...value, width })} onDone={() => {}} /><Range label={t("editor.brush.opacity", { defaultValue: "Ink opacity" }) + `: ${Math.round((value.opacity ?? 1) * 100)}%`} value={(value.opacity ?? 1) * 100} min={5} max={100} step={1} onLive={opacity => onChange({ ...value, opacity: opacity / 100 })} onDone={() => {}} /></>}
    {refineOnly ? <View><Text className="mb-2 text-xs text-white/60">{t("editor.brush.smoothing", { defaultValue: "Smoothing" })}: {Math.round((value.smoothing ?? 1) * 100)}%</Text><ChipRow>{[0, 25, 50, 75, 100].map(amount => <Chip key={amount} label={`${amount}%`} active={Math.round((value.smoothing ?? 1) * 100) === amount} onPress={() => onChange({ ...value, smoothing: amount / 100 })} />)}</ChipRow></View> : <Range label={t("editor.brush.smoothing", { defaultValue: "Smoothing" }) + `: ${Math.round((value.smoothing ?? 1) * 100)}%`} value={(value.smoothing ?? 1) * 100} min={0} max={100} step={1} onLive={smoothing => onChange({ ...value, smoothing: smoothing / 100 })} onDone={() => {}} />}
    <Text className="text-xs text-white/60">{t("editor.brush.capLabel", { defaultValue: "Stroke endings" })}</Text><ChipRow>{(["round", "butt", "square"] as const).map(cap => <Chip key={cap} label={t(`editor.brush.cap.${cap}`, { defaultValue: ({ round: "Rounded", butt: "Flat", square: "Square" })[cap] })} active={(value.cap ?? "round") === cap} onPress={() => onChange({ ...value, cap })} />)}</ChipRow>
    <Text className="text-xs text-white/60">{t("editor.brush.joinLabel", { defaultValue: "Stroke corners" })}</Text><ChipRow>{(["round", "bevel", "miter"] as const).map(join => <Chip key={join} label={t(`editor.brush.join.${join}`, { defaultValue: ({ round: "Rounded", bevel: "Bevel", miter: "Pointed" })[join] })} active={(value.join ?? "round") === join} onPress={() => onChange({ ...value, join })} />)}</ChipRow>
    <Toggle label={t("editor.brush.closed", { defaultValue: "Close the outline" })} value={!!value.closed} onChange={closed => onChange({ ...value, closed })} />
  </View>;
}
