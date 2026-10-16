import DesignLinkPanel from "./DesignLinkPanel";
import RepeatGridPanel from "./RepeatGridPanel";
import SelectionTransformControls from "./SelectionTransformControls";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { layoutDesign, LAYOUT_ACTIONS, type DesignLayoutBox, type LayoutAction } from "../../libs/editor/designLayout";
import { groupedSelection } from "../../libs/editor/designGroups";
import { getTransform, placementPatchAt, updateClip } from "../../libs/editor/project";
import { resolveClipAt } from "../../libs/editor/keyframes";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function DesignLayoutPanel({ project, ids, current, commit, boxes, time, recording }: {
  project: ProjectSnapshot; ids: string[]; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; boxes: () => DesignLayoutBox[]; time: number; recording?: boolean;
}) {
  const { t } = useTranslation();
  const [repeatOpen, setRepeatOpen] = useState(false), [linksOpen, setLinksOpen] = useState(false);
  const [reference, setReference] = useState<"page" | "selection">("selection");
  const [columns, setColumns] = useState("0"), [gap, setGap] = useState("24");
  const apply = (action: LayoutAction) => {
    const latest = current(); if (!latest || latest.id !== project.id) return;
    const chosen = new Set(groupedSelection(latest.clips, ids, time));
    const selected = latest.clips.filter(c => chosen.has(c.id) && c.kind !== "audio" && !c.isPageBackground && !c.hidden && time >= c.start && time < c.start + c.duration && !latest.tracks.find(track => track.id === c.trackId)?.hidden);
    if (selected.some(c => c.locked)) return;
    const measured = boxes().flatMap(box => {
      const clip = selected.find(c => c.id === box.id);
      return clip ? [{ ...box, groupId: clip.groupId }] : [];
    });
    if (measured.length !== selected.length) return;
    const moves = layoutDesign(measured, action, latest.settings, reference, Number(columns) || 0, Number(gap) || 0);
    if (!moves.length) return;
    let next = latest;
    for (const move of moves) {
      const clip = latest.clips.find(c => c.id === move.id); if (!clip) continue;
      const transform = getTransform(resolveClipAt(clip, time));
      next = updateClip(next, clip.id, placementPatchAt(clip, { x: transform.x + move.dx / latest.settings.width, y: transform.y + move.dy / latest.settings.height }, time, { record: recording }));
    }
    commit(next);
  };
  return <View style={{ gap: 10 }}>
    <SelectionTransformControls project={project} ids={ids} current={current} commit={commit} boxes={boxes} time={time} recording={recording} />
    <View className="flex-row" style={{ gap: 8 }}>{(["selection", "page"] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === reference }} onPress={() => setReference(value)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${value === reference ? "border-white bg-white/15" : "border-white/20"}`}><Text className="text-xs text-white">{t(`editor.layout.reference.${value}`, { defaultValue: value === "page" ? "Align to page" : "Align to selection" })}</Text></Pressable>)}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{LAYOUT_ACTIONS.map(({ action, label }) => <Pressable key={action} accessibilityRole="button" disabled={!ids.length} onPress={() => apply(action)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: ids.length ? 1 : 0.35 }}><Text className="text-xs text-white">{t(`editor.layout.${action}`, { defaultValue: label })}</Text></Pressable>)}</View>
    <View className="flex-row" style={{ gap: 10 }}>
      <View className="flex-1" style={{ gap: 6 }}><Text className="text-xs text-white/60">{t("editor.layout.columns", { defaultValue: "Grid columns (0 = auto)" })}</Text><TextInput accessibilityLabel={t("editor.layout.columns", { defaultValue: "Grid columns (0 = auto)" })} value={columns} onChangeText={setColumns} keyboardType="number-pad" maxLength={2} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View>
      <View className="flex-1" style={{ gap: 6 }}><Text className="text-xs text-white/60">{t("editor.layout.gap", { defaultValue: "Grid gap in pixels" })}</Text><TextInput accessibilityLabel={t("editor.layout.gap", { defaultValue: "Grid gap in pixels" })} value={gap} onChangeText={setGap} keyboardType="number-pad" maxLength={4} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View>
    </View>
    <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: repeatOpen }} onPress={() => setRepeatOpen(!repeatOpen)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.repeat.multiSelection", { defaultValue: "Repeat selected artwork as one tile" })} {repeatOpen ? "−" : "+"}</Text></Pressable>{repeatOpen && <RepeatGridPanel project={project} selectedId={null} selectedIds={ids} time={time} current={current} commit={commit} boxes={boxes} />}</View>
    <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: linksOpen }} onPress={() => setLinksOpen(!linksOpen)} className="min-h-[40px] justify-center"><Text className="text-xs font-semibold text-white/75">{t("editor.links.multiSelection", { defaultValue: "Links for selected artwork" })} {linksOpen ? "−" : "+"}</Text></Pressable>{linksOpen && <DesignLinkPanel project={project} selectedId={null} selectedIds={ids} time={time} current={current} commit={commit} />}</View>
  </View>;
}
