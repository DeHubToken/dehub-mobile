import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import SavePalettePreset from "./SavePalettePreset";
import { useTranslation } from "react-i18next";
import { useBrandPresets } from "../../libs/editor/useBrandPresets";
import { gradientFromBrandPalette } from "../../libs/editor/gradientBrandPalette";
import type { GradientFill } from "../../libs/editor/gradientFill";
export default function GradientBrandPalettes({ value, onChange }: { value: GradientFill; onChange: (value: GradientFill) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(), library = useBrandPresets(), palettes = library.presets.filter(preset => preset.styles.colors.length >= 2);
  const colours = [...new Set(value.stops.slice().sort((a, b) => a.offset - b.offset).map(stop => stop.colour))];
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.gradients.brandPalettes", { defaultValue: "Saved palettes and gradient colours" })} {open ? "−" : "+"}</Text></Pressable>{open && <><View className="flex-row flex-wrap" style={{ gap: 6 }}>{palettes.map(preset => <Pressable key={preset.id} accessibilityRole="button" onPress={() => onChange(gradientFromBrandPalette(value, preset.styles.colors))} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ gap: 4 }}><View className="flex-row overflow-hidden rounded">{preset.styles.colors.map((colour, index) => <View key={index} style={{ width: 10, height: 14, backgroundColor: colour }} />)}</View><Text className="text-xs text-white/75">{preset.name}</Text></Pressable>)}</View>{!palettes.length && <Text className="text-xs text-white/45">{t("editor.gradients.noBrandPalettes", { defaultValue: "Save a palette with at least two colours in Brand styles to use it here." })}</Text>}<Text className="text-xs text-white/45">{t("editor.gradients.brandPaletteHint", { defaultValue: "Loads palette colours into the gradient draft with opaque, evenly spaced stops. Gradients use up to eight colours; larger palettes keep their endpoints and sample the colours between them." })}</Text><SavePalettePreset colours={colours} /></>}</View>;
}
