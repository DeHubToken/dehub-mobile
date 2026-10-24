import { tableFromBrandPalette } from "../../libs/editor/tableBrandPalette";
import type { TableData } from "../../libs/editor/dataVisuals";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import SavePalettePreset from "./SavePalettePreset";
import { useTranslation } from "react-i18next";
import { useBrandPresets } from "../../libs/editor/useBrandPresets";
export default function TableBrandPalettes({ value, onChange }: { value: Omit<TableData, "rows">; onChange: (value: Omit<TableData, "rows">) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(), library = useBrandPresets(), palettes = library.presets.filter(preset => preset.styles.colors.length > 0);
  const colours = [...new Set([value.headerColour, value.headerTextColour, value.cellColour, value.textColour, value.borderColour, ...(value.stripeColour ? [value.stripeColour] : [])])];
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.tables.brandPalettes", { defaultValue: "Saved header colours and table palette" })} {open ? "−" : "+"}</Text></Pressable>{open && <><View className="flex-row flex-wrap" style={{ gap: 6 }}>{palettes.map(preset => <Pressable key={preset.id} accessibilityRole="button" onPress={() => onChange(tableFromBrandPalette(value, preset.styles.colors))} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ gap: 4 }}><View className="flex-row overflow-hidden rounded">{preset.styles.colors.map((colour, index) => <View key={index} style={{ width: 10, height: 14, backgroundColor: colour }} />)}</View><Text className="text-xs text-white/75">{preset.name}</Text></Pressable>)}</View>{!palettes.length && <Text className="text-xs text-white/45">{t("editor.tables.noBrandPalettes", { defaultValue: "Save a colour palette in Brand styles to use it here." })}</Text>}<Text className="text-xs text-white/45">{t("editor.tables.brandPaletteHint", { defaultValue: "Uses the first saved palette colour for the header, with matching borders, subtle stripes and automatic black or white text. Body fills and custom cell styles stay in place. Save palette stores the current table colours." })}</Text><SavePalettePreset colours={colours} /></>}</View>;
}
