import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import TableCellVerticalControls from "./TableCellVerticalControls";
import TableCellSizeControls from "./TableCellSizeControls";
import type { TableCellStyle } from "../../libs/editor/tableCellStyles";
export default function TableCellTypographyControls({ value, onApply }: { value: TableCellStyle; onApply: (patch: TableCellStyle) => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false);
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.tables.cellTypography", { defaultValue: "Selected cell typography" })} {open ? "−" : "+"}</Text></Pressable>{open && <><TableCellVerticalControls value={value.verticalAlign} onApply={verticalAlign => onApply({ verticalAlign })} /><TableCellSizeControls value={value.fontScale} onApply={fontScale => onApply({ fontScale })} /></>}</View>;
}
