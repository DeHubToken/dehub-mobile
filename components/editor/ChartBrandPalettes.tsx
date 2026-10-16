import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import SavePalettePreset from "./SavePalettePreset";
import { useTranslation } from "react-i18next";
import { useBrandPresets } from "../../libs/editor/useBrandPresets";
export default function ChartBrandPalettes({ value, onChange }: { value: readonly string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(), library = useBrandPresets(), palettes = library.presets.filter(preset => preset.styles.colors.length > 0);
  const colours = [...new Set(value)].slice(0, 10);
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.charts.brandPalettes", { defaultValue: "Saved palettes and chart colours" })} {open ? "−" : "+"}</Text></Pressable>{open && <><View className="flex-row flex-wrap" style={{ gap: 6 }}>{palettes.map(preset => <Pressable key={preset.id} accessibilityRole="button" onPress={() => onChange([...preset.styles.colors])} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ gap: 4 }}><View className="flex-row overflow-hidden rounded">{preset.styles.colors.map((colour, index) => <View key={index} style={{ width: 10, height: 14, backgroundColor: colour }} />)}</View><Text className="text-xs text-white/75">{preset.name}</Text></Pressable>)}</View>{!palettes.length && <Text className="text-xs text-white/45">{t("editor.charts.noBrandPalettes", { defaultValue: "Save a colour palette in Brand styles to use it here." })}</Text>}<Text className="text-xs text-white/45">{t("editor.charts.brandPaletteHint", { defaultValue: "Loads a saved palette into this chart draft. Save palette stores up to the first ten distinct chart colours in Brand styles. Chart values stay unchanged." })}</Text><SavePalettePreset colours={colours} /></>}</View>;
}
