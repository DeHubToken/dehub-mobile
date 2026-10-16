import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import type { PhotoTone } from "../../libs/editor/photoTone";

export default function DuotoneColours({ value, onChange }: { value: NonNullable<PhotoTone["duotone"]>; onChange: (value: NonNullable<PhotoTone["duotone"]>) => void }) {
  const { t } = useTranslation();
  const [dark, setDark] = useState(value.dark), [light, setLight] = useState(value.light);
  useEffect(() => { setDark(value.dark); setLight(value.light); }, [value.dark, value.light]);
  return <View className="my-2 flex-row" style={{ gap: 8 }}>{(["dark", "light"] as const).map(key => {
    const colour = key === "dark" ? dark : light, valid = /^#[\da-f]{6}$/i.test(colour);
    return <View key={key} className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t(`editor.photoTone.${key}`, { defaultValue: key === "dark" ? "Shadows colour" : "Highlights colour" })}</Text><TextInput value={colour} onChangeText={key === "dark" ? setDark : setLight} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t(`editor.photoTone.${key}`, { defaultValue: key })} onEndEditing={() => { if (valid) onChange({ ...value, [key]: colour }); }} className={`min-h-[40px] rounded-lg border px-3 text-white ${valid ? "border-white/20" : "border-red-400"}`} /></View>;
  })}</View>;
}
