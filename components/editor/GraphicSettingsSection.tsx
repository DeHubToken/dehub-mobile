import React, { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
export default function GraphicSettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{title} {open ? "−" : "+"}</Text></Pressable><View accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"} style={{ display: open ? "flex" : "none", gap: 10 }}>{children}</View></View>;
}
