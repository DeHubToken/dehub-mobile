import QrContentBuilder from "./QrContentBuilder";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { applyDesignLink, designPageLinkIndex, normaliseDesignLink } from "../../libs/editor/designLinks";
import { getPages } from "../../libs/editor/pages";
import { groupedSelection } from "../../libs/editor/designGroups";
import type { ProjectSnapshot } from "../../libs/editor/types";
type Props = { project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; time: number };
export default function DesignLinkPanel(props: Props) {
  return <LinkDraft key={`${props.project.id}:${props.selectedId}`} {...props} />;
}
function LinkDraft({ project, selectedId, current, commit, time }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(project.clips.find(c => c.id === selectedId)?.href ?? "");
  const [mode, setMode] = useState<"url" | "page">(designPageLinkIndex(value) === null ? "url" : "page");
  const [pageNumber, setPageNumber] = useState(String((designPageLinkIndex(value) ?? 0) + 1));
  const pages = getPages(project.settings, project.clips), target = Number(pageNumber) - 1;
  const ids = groupedSelection(project.clips, selectedId ? [selectedId] : [], time);
  const disabled = !ids.length || project.clips.some(c => ids.includes(c.id) && c.locked);
  const apply = (href: string | null) => {
    const latest = current(); if (!latest || latest.id !== project.id || disabled) return;
    const chosen = groupedSelection(latest.clips, selectedId ? [selectedId] : [], time);
    const next = applyDesignLink(latest, chosen, href); if (next !== latest) commit(next);
    if (href === null) setValue("");
  };
  const valid = mode === "page" ? Number.isInteger(target) && pages[target] ? `#page=${target + 1}` : null : normaliseDesignLink(value);
  return <View className="px-3" style={{ gap: 10 }}>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["url", "page"] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: mode === kind }} onPress={() => setMode(kind)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${mode === kind ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white">{t(kind === "url" ? "editor.links.mode.contactUrl" : "editor.links.mode.page", { defaultValue: kind === "url" ? "Website or contact link" : "Page in this design" })}</Text></Pressable>)}</View>
    <QrContentBuilder kinds={["email", "phone", "sms"]} title={t("editor.links.contactBuilder", { defaultValue: "Build email, phone or SMS link" })} onUse={next => { setValue(next); setMode("url"); }} />
    {mode === "url" ? <><Text className="text-xs text-white/60">{t("editor.links.destination", { defaultValue: "Link destination" })}</Text><TextInput accessibilityLabel={t("editor.links.destination", { defaultValue: "Link destination" })} value={value} onChangeText={setValue} keyboardType="url" autoCapitalize="none" autoCorrect={false} maxLength={2048} placeholder="https://" placeholderTextColor="#888" className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></> : <View className="flex-row items-center" style={{ gap: 10 }}><Text className="text-xs text-white/60">{t("editor.links.targetPage", { defaultValue: "Destination page" })}</Text><TextInput accessibilityLabel={t("editor.links.targetPage", { defaultValue: "Destination page" })} value={pageNumber} onChangeText={setPageNumber} keyboardType="number-pad" maxLength={3} className="min-h-[40px] w-20 rounded-lg border border-white/20 px-3 text-white" /><Text numberOfLines={2} className="flex-1 text-xs text-white/60">{Number.isInteger(target) && pages[target] ? project.settings.pageDetails?.[target]?.title || `${target + 1} / ${pages.length}` : `1–${pages.length}`}</Text></View>}
    <View className="flex-row" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={disabled || !valid} onPress={() => valid && apply(valid)} className="min-h-[40px] justify-center rounded-lg bg-white px-3" style={{ opacity: disabled || !valid ? 0.35 : 1 }}><Text className="text-xs font-semibold text-black">{t("editor.links.apply", { defaultValue: "Apply link" })}</Text></Pressable><Pressable accessibilityRole="button" disabled={disabled} onPress={() => apply(null)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{t("editor.links.remove", { defaultValue: "Remove link" })}</Text></Pressable></View>
    <Text className="text-xs text-white/50">{t("editor.links.hint", { defaultValue: "PDF downloads preserve web, email, phone, SMS and page links. Contact-link handling depends on the viewer and device. Export destination pages to keep internal links active." })}</Text>
  </View>;
}
