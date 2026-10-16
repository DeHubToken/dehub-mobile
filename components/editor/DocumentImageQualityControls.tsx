import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DOCUMENT_IMAGE_PROFILES, type DocumentImageProfile } from "../../libs/editor/documentImageProfile";
export default function DocumentImageQualityControls({ value, onChange }: { value: DocumentImageProfile; onChange: (value: DocumentImageProfile) => void }) {
  const { t } = useTranslation();
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Text className="text-xs text-white/65">{t("editor.export.documentImageQuality", { defaultValue: "Page image detail" })}</Text><View className="flex-row flex-wrap" style={{ gap: 6 }}>{DOCUMENT_IMAGE_PROFILES.map(profile => <Pressable key={profile.id} accessibilityRole="button" accessibilityState={{ selected: value === profile.id }} onPress={() => onChange(profile.id)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${value === profile.id ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white/75">{t(`editor.export.documentProfile.${profile.id}`, { defaultValue: profile.label })}</Text></Pressable>)}</View><Text className="text-[10px] text-white/45">{t("editor.export.documentImageHint", { defaultValue: "Higher detail keeps larger page images. Smaller files reduce image dimensions and JPEG quality. Page size and links are preserved." })}</Text></View>;
}
