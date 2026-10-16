import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePresentationStopwatch } from "../../libs/editor/usePresentationStopwatch";
export default function PresentationStopwatch({ foreground }: { foreground: boolean }) {
  const { t } = useTranslation(), clock = usePresentationStopwatch(foreground);
  return <View className="flex-row flex-wrap items-center justify-center border-t border-white/10 px-3 py-1" style={{ gap: 8 }}><Text className="text-xs text-white/45">{t("editor.present.elapsed", { defaultValue: "Elapsed" })}</Text><Text accessibilityLabel={t("editor.present.elapsedValue", { defaultValue: "Elapsed presentation time {{time}}", time: clock.label })} className="text-center text-xs text-white/75" style={{ minWidth: 50, fontVariant: ["tabular-nums"] }}>{clock.label}</Text><Pressable accessibilityRole="button" accessibilityState={{ selected: !clock.running }} onPress={clock.toggle} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/65">{t(clock.running ? "editor.present.pauseClock" : "editor.present.resumeClock", { defaultValue: clock.running ? "Pause clock" : "Resume clock" })}</Text></Pressable><Pressable accessibilityRole="button" onPress={clock.reset} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/65">{t("editor.present.resetClock", { defaultValue: "Reset clock" })}</Text></Pressable></View>;
}
