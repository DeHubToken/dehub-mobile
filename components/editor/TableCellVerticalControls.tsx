import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
export default function TableCellVerticalControls({ value, onApply }: { value?: "top" | "middle" | "bottom"; onApply: (value?: "top" | "middle" | "bottom") => void }) {
  const { t } = useTranslation();
  return <View style={{ gap: 6 }}><Text className="text-xs text-white/65">{t("editor.tables.cellVertical", { defaultValue: "Selected cell vertical alignment" })}</Text><View className="flex-row flex-wrap" style={{ gap: 6 }}>{(["top", "middle", "bottom", "default"] as const).map(align => <Pressable key={align} accessibilityRole="button" accessibilityState={{ selected: value === (align === "default" ? undefined : align) }} onPress={() => onApply(align === "default" ? undefined : align)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${value === (align === "default" ? undefined : align) ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white/75">{t(`editor.tables.cellVertical.${align}`, { defaultValue: ({ top: "Top", middle: "Middle", bottom: "Bottom", default: "Use table alignment" })[align] })}</Text></Pressable>)}</View></View>;
}
