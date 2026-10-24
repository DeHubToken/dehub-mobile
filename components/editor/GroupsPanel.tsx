import ReusableElementsPanel from "./ReusableElementsPanel";
import LayerNamingControls from "./LayerNamingControls";
import PageLayerTransferControls from "./PageLayerTransferControls";
import SimilarSelectionControls from "./SimilarSelectionControls";
import { selectablePageLayers } from "../../libs/editor/similarSelection";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import DesignLayoutPanel from "./DesignLayoutPanel";
import DesignClipboardControls from "./DesignClipboardControls";
import type { DesignLayoutBox } from "../../libs/editor/designLayout";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { groupedSelection, groupDesignLayers, ungroupDesignLayers } from "../../libs/editor/designGroups";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function GroupsPanel({ project, selectedId, current, commit, select, time, boxes, recording }: {
  boxes: () => DesignLayoutBox[]; recording?: boolean;
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string | null) => void; time: number;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string[]>(selectedId ? groupedSelection(project.clips, [selectedId], time) : []);
  useEffect(() => {
    const active = new Set(project.clips.filter(clip => !clip.isPageBackground && time >= clip.start && time < clip.start + clip.duration).map(clip => clip.id));
    setPicked(previous => (selectedId ? previous.includes(selectedId) ? previous : groupedSelection(project.clips, [selectedId], time) : []).filter(id => active.has(id)));
  }, [project.id, selectedId, time]);
  const visible = project.clips.filter(c => c.kind !== "audio" && !c.isPageBackground && !c.hidden && time >= c.start && time < c.start + c.duration && !project.tracks.find(track => track.id === c.trackId)?.hidden);
  const [showSavedElements, setShowSavedElements] = useState(false);
  const [query, setQuery] = useState(""), [offset, setOffset] = useState(0);
  const needle = query.trim().toLowerCase(), matches = visible.filter(clip => `${clip.label ?? ""} ${clip.kind === "text" ? clip.text : ""} ${project.tracks.find(track => track.id === clip.trackId)?.name ?? ""} ${clip.kind}`.toLowerCase().includes(needle));
  const first = Math.min(offset, Math.max(0, Math.floor((matches.length - 1) / 24) * 24));
  const locked = project.clips.some(c => picked.includes(c.id) && c.locked);
  const apply = (ungroup: boolean) => {
    const latest = current();
    if (!latest || latest.id !== project.id) return;
    const next = ungroup ? ungroupDesignLayers(latest, picked) : groupDesignLayers(latest, picked, () => newId(10));
    if (next !== latest) { commit(next); const id = picked.find(value => next.clips.some(c => c.id === value)); if (id) select(id); }
  };
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.groups.hint", { defaultValue: "Select layers to move, resize, rotate, and duplicate together." })}</Text>
    <SimilarSelectionControls project={project} ids={picked} time={time} current={current} onChange={setPicked} />
    <TextInput value={query} onChangeText={value => { setQuery(value); setOffset(0); }} accessibilityLabel={t("editor.groups.findLayers", { defaultValue: "Find layers to select" })} placeholder={t("editor.groups.findLayers", { defaultValue: "Find layers to select" })} placeholderTextColor="#777" autoCorrect={false} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-xs text-white" />
    <Pressable accessibilityRole="button" disabled={!matches.length} onPress={() => { const allowed = new Set(selectablePageLayers(project, time).map(clip => clip.id)); setPicked(groupedSelection(project.clips, matches.filter(clip => allowed.has(clip.id)).map(clip => clip.id), time).filter(id => allowed.has(id))); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.groups.selectMatches", { defaultValue: "Select matching layers" })}</Text></Pressable>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 150 }} contentContainerStyle={{ gap: 6 }}>
      {matches.slice(first, first + 24).map(clip => <Pressable key={clip.id} accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(clip.id), disabled: !!clip.locked }} disabled={clip.locked} onPress={() => {
        const members = groupedSelection(project.clips, [clip.id], time);
        setPicked(ids => ids.includes(clip.id) ? ids.filter(id => !members.includes(id)) : [...new Set([...ids, ...members])]);
      }} className={`min-h-[40px] justify-center rounded-lg border px-3 ${picked.includes(clip.id) ? "border-white bg-white/15" : "border-white/15"}`} style={{ opacity: clip.locked ? 0.4 : 1 }}>
        <Text numberOfLines={1} className="text-xs text-white">{picked.includes(clip.id) ? "✓  " : "○  "}{clip.label || (clip.kind === "text" ? clip.text : project.tracks.find(track => track.id === clip.trackId)?.name ?? clip.kind)}{clip.groupId ? ` · ${t("editor.groups.group", { defaultValue: "Group" })}` : ""}</Text>
      </Pressable>)}
    </ScrollView>
    {matches.length > 24 && <View className="flex-row items-center" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={first === 0} onPress={() => setOffset(first - 24)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: first === 0 ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t("common.previous", { defaultValue: "Previous" })}</Text></Pressable><Text className="text-xs text-white/45">{first + 1}–{Math.min(first + 24, matches.length)} / {matches.length}</Text><Pressable accessibilityRole="button" disabled={first + 24 >= matches.length} onPress={() => setOffset(first + 24)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: first + 24 >= matches.length ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t("common.next", { defaultValue: "Next" })}</Text></Pressable></View>}
    {!matches.length && <Text className="text-xs text-white/45">{t("editor.groups.noMatches", { defaultValue: "No matching layers on this page" })}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSavedElements }} onPress={() => setShowSavedElements(!showSavedElements)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.elements.selectionLibrary", { defaultValue: "Save or reuse selected elements" })}</Text></Pressable>
    {showSavedElements && <ReusableElementsPanel project={project} ids={picked} time={time} current={current} commit={commit} select={select} onInserted={setPicked} />}
    <LayerNamingControls project={project} ids={picked} time={time} current={current} commit={commit} />
    <DesignLayoutPanel project={project} ids={picked} current={current} commit={commit} boxes={boxes} time={time} recording={recording} />
    <PageLayerTransferControls project={project} ids={picked} time={time} current={current} commit={commit} onMoved={() => { setPicked([]); select(null); }} />
    <DesignClipboardControls project={project} ids={picked} time={time} current={current} commit={commit} select={select} onPasted={setPicked} />
    <View className="flex-row" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" disabled={picked.length < 2 || locked} onPress={() => apply(false)} className="min-h-[40px] justify-center rounded-lg bg-white px-4" style={{ opacity: picked.length < 2 || locked ? 0.35 : 1 }}><Text className="text-xs font-semibold text-black">{t("editor.groups.group", { defaultValue: "Group" })}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={locked || !project.clips.some(c => picked.includes(c.id) && c.groupId)} onPress={() => apply(true)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-4"><Text className="text-xs text-white">{t("editor.groups.ungroup", { defaultValue: "Ungroup" })}</Text></Pressable>
    </View>
  </View>;
}
