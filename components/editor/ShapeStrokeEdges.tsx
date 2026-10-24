import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ShapeClip } from "../../libs/editor/types";
export default function ShapeStrokeEdges({ value, onChange }: { value: ShapeClip; onChange: (patch: Partial<ShapeClip>) => void }) {
  const { t } = useTranslation(), open = value.shape === "line" || value.shape === "arrow";
  if (!value.stroke || value.shape === "path" || value.connector || value.chart || value.table || value.qr) return null;
  const choose = (kind: "strokeCap" | "strokeJoin", option: string) => onChange(kind === "strokeCap" ? { strokeCap: option as ShapeClip["strokeCap"] } : { strokeJoin: option as ShapeClip["strokeJoin"] });
  const choices = (kind: "strokeCap" | "strokeJoin", title: string, options: readonly string[], names: Record<string, string>) => <View style={{ gap: 6 }}><Text className="text-xs text-white/55">{title}</Text><View className="flex-row flex-wrap" style={{ gap: 6 }}>{options.map(option => <Pressable key={option} disabled={!!value.locked} accessibilityRole="button" accessibilityState={{ selected: (value[kind] ?? "round") === option, disabled: !!value.locked }} onPress={() => choose(kind, option)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${(value[kind] ?? "round") === option ? "border-cyan-300 bg-cyan-300/10" : "border-white/15"}`} style={{ opacity: value.locked ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t(`editor.stroke.${kind}.${option}`, { defaultValue: names[option] })}</Text></Pressable>)}</View></View>;
  return <View style={{ gap: 8 }}>{open && choices("strokeCap", t("editor.stroke.ends", { defaultValue: "Line ends" }), ["round", "butt", "square"], { round: "Round", butt: "Flat", square: "Square" })}{choices("strokeJoin", t("editor.stroke.joins", { defaultValue: "Outline corners" }), ["round", "bevel", "miter"], { round: "Rounded", bevel: "Beveled", miter: "Sharp" })}</View>;
}
