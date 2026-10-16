import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { applyDesignLink, normaliseDesignLink } from "../../libs/editor/designLinks";
import { groupedSelection } from "../../libs/editor/designGroups";
import type { ProjectSnapshot } from "../../libs/editor/types";
type Props = { project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; time: number };
export default function DesignLinkPanel(props: Props) {
  return <LinkDraft key={`${props.project.id}:${props.selectedId}`} {...props} />;
}
function LinkDraft({ project, selectedId, current, commit, time }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(project.clips.find(c => c.id === selectedId)?.href ?? "");
  const ids = groupedSelection(project.clips, selectedId ? [selectedId] : [], time);
  const disabled = !ids.length || project.clips.some(c => ids.includes(c.id) && c.locked);
  const apply = (href: string | null) => {
    const latest = current(); if (!latest || latest.id !== project.id || disabled) return;
    const chosen = groupedSelection(latest.clips, selectedId ? [selectedId] : [], time);
    const next = applyDesignLink(latest, chosen, href); if (next !== latest) commit(next);
    if (href === null) setValue("");
  };
  const valid = normaliseDesignLink(value);
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.links.destination", { defaultValue: "Link destination" })}</Text>
    <TextInput accessibilityLabel={t("editor.links.destination", { defaultValue: "Link destination" })} value={value} onChangeText={setValue} keyboardType="url" autoCapitalize="none" autoCorrect={false} maxLength={2048} placeholder="https://" placeholderTextColor="#888" className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <View className="flex-row" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={disabled || !valid} onPress={() => valid && apply(valid)} className="min-h-[40px] justify-center rounded-lg bg-white px-3" style={{ opacity: disabled || !valid ? 0.35 : 1 }}><Text className="text-xs font-semibold text-black">{t("editor.links.apply", { defaultValue: "Apply link" })}</Text></Pressable><Pressable accessibilityRole="button" disabled={disabled} onPress={() => apply(null)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{t("editor.links.remove", { defaultValue: "Remove link" })}</Text></Pressable></View>
    <Text className="text-xs text-white/50">{t("editor.links.hint", { defaultValue: "Select text, photos, or shapes. PDF downloads preserve clickable web, email, and phone links." })}</Text>
  </View>;
}
