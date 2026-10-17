import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpcomingPagePreview, type UpcomingPresentationPage } from "../../libs/editor/useUpcomingPagePreview";
export default function PresentationNextPage({ next, onInteract, active = true }: { active?: boolean; next: UpcomingPresentationPage; onInteract: () => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), result = useUpcomingPagePreview(next, open && active);
  const title = next.title || t("editor.pages.page", { number: next.index + 1 });
  return <View className="mt-4 border-t border-white/15 pt-2" style={{ gap: 6 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { onInteract(); setOpen(!open); }} className="min-h-[40px] justify-center"><Text className="text-xs text-white/65">{t("editor.present.upNext", { defaultValue: "Up next" })}: {next.index + 1}. {title} {open ? "−" : "+"}</Text></Pressable>{open && <>{result.image && <Image source={{ uri: result.image }} resizeMode="contain" accessibilityLabel={t("editor.present.nextPreviewAlt", { defaultValue: "Upcoming page: {{title}}", title })} style={{ width: "100%", height: 128 }} />}<Text accessibilityLiveRegion="polite" className="text-[10px] text-white/45">{result.busy ? t("editor.present.nextLoading", { defaultValue: "Preparing next-page preview…" }) : result.unavailable ? t("editor.present.nextUnavailable", { defaultValue: "Next-page preview is unavailable." }) : t("editor.present.nextPreviewHint", { defaultValue: "Preview only. Use Next to move to this page." })}</Text></>}</View>;
}
