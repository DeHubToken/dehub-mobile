import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { groupedSelection, groupDesignLayers, ungroupDesignLayers } from "../../libs/editor/designGroups";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function GroupsPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string[]>(selectedId ? groupedSelection(project.clips, [selectedId], time) : []);
  useEffect(() => { setPicked(selectedId ? groupedSelection(project.clips, [selectedId], time) : []); }, [project.id, selectedId]);
  const visible = project.clips.filter(c => c.kind !== "audio" && !c.hidden && time >= c.start && time < c.start + c.duration && !project.tracks.find(track => track.id === c.trackId)?.hidden);
  const locked = project.clips.some(c => picked.includes(c.id) && c.locked);
  const apply = (ungroup: boolean) => {
    const latest = current();
    if (!latest || latest.id !== project.id) return;
    const next = ungroup ? ungroupDesignLayers(latest, picked) : groupDesignLayers(latest, picked, () => newId(10));
    if (next !== latest) { commit(next); const id = picked.find(value => next.clips.some(c => c.id === value)); if (id) select(id); }
  };
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.groups.hint", { defaultValue: "Select layers to move, resize, rotate, and duplicate together." })}</Text>
    <ScrollView style={{ maxHeight: 150 }} contentContainerStyle={{ gap: 6 }}>
      {visible.map(clip => <Pressable key={clip.id} accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(clip.id), disabled: !!clip.locked }} disabled={clip.locked} onPress={() => {
        const members = groupedSelection(project.clips, [clip.id], time);
        setPicked(ids => ids.includes(clip.id) ? ids.filter(id => !members.includes(id)) : [...new Set([...ids, ...members])]);
      }} className={`min-h-[40px] justify-center rounded-lg border px-3 ${picked.includes(clip.id) ? "border-white bg-white/15" : "border-white/15"}`} style={{ opacity: clip.locked ? 0.4 : 1 }}>
        <Text numberOfLines={1} className="text-xs text-white">{picked.includes(clip.id) ? "✓  " : "○  "}{clip.kind === "text" ? clip.text : project.tracks.find(track => track.id === clip.trackId)?.name ?? clip.kind}{clip.groupId ? ` · ${t("editor.groups.group", { defaultValue: "Group" })}` : ""}</Text>
      </Pressable>)}
    </ScrollView>
    <View className="flex-row" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" disabled={picked.length < 2 || locked} onPress={() => apply(false)} className="min-h-[40px] justify-center rounded-lg bg-white px-4" style={{ opacity: picked.length < 2 || locked ? 0.35 : 1 }}><Text className="text-xs font-semibold text-black">{t("editor.groups.group", { defaultValue: "Group" })}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={locked || !project.clips.some(c => picked.includes(c.id) && c.groupId)} onPress={() => apply(true)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-4"><Text className="text-xs text-white">{t("editor.groups.ungroup", { defaultValue: "Ungroup" })}</Text></Pressable>
    </View>
  </View>;
}
