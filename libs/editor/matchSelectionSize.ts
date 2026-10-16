import { groupedSelection } from "./designGroups";
import { measureSelectionBounds, planSelectionTransform, type SelectionTransformPlan } from "./selectionTransforms";
import type { DesignLayoutBox } from "./designLayout";
import type { ProjectSnapshot } from "./types";
export type MatchSizeAxis = "width" | "height" | "fit";
export type MatchSizeReference = "first" | "largest" | "smallest";

export function planMatchSelectionSize(project: ProjectSnapshot, ids: readonly string[], time: number, measured: readonly DesignLayoutBox[], axis: MatchSizeAxis, reference: MatchSizeReference): SelectionTransformPlan[] {
  if (!["width", "height", "fit"].includes(axis) || !["first", "largest", "smallest"].includes(reference)) throw new Error("Choose how to match selected sizes");
  const selected = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const layers = project.clips.filter(clip => selected.has(clip.id) && clip.kind !== "audio" && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
  if (layers.some(clip => clip.locked)) throw new Error("Unlock the selected layers before matching sizes");
  if (layers.length > 100) throw new Error("Match up to one hundred selected layers at a time");
  const keyFor = (clip: typeof layers[number]) => clip.groupId ? "group:" + clip.groupId : "layer:" + clip.id;
  const groups = new Map<string, string[]>();
  for (const clip of layers) { const key = keyFor(clip); groups.set(key, [...(groups.get(key) ?? []), clip.id]); }
  if (groups.size < 2) throw new Error("Select at least two separate layers or groups");
  const keys = [...new Set([...ids.flatMap(id => { const clip = layers.find(clip => clip.id === id); return clip ? [keyFor(clip)] : []; }), ...groups.keys()])];
  const units = keys.map(key => {
    const members = groups.get(key)!, bounds = measureSelectionBounds(project, members, time, measured);
    if (!bounds || bounds.width < 0.001 || bounds.height < 0.001) throw new Error("Wait for every selected layer to appear on the canvas");
    return { members, bounds };
  });
  const amount = (unit: typeof units[number]) => axis === "width" ? unit.bounds.width : axis === "height" ? unit.bounds.height : unit.bounds.width * unit.bounds.height;
  const target = reference === "first" ? units[0] : units.reduce((chosen, unit) => reference === "largest" ? amount(unit) > amount(chosen) ? unit : chosen : amount(unit) < amount(chosen) ? unit : chosen, units[0]);
  const plans: SelectionTransformPlan[] = [];
  for (const unit of units) {
    const ratio = axis === "width" ? target.bounds.width / unit.bounds.width : axis === "height" ? target.bounds.height / unit.bounds.height : Math.min(target.bounds.width / unit.bounds.width, target.bounds.height / unit.bounds.height);
    if (Math.abs(ratio - 1) < 1e-7) continue;
    plans.push(...planSelectionTransform(project, unit.members, time, measured, { kind: "scale", factor: ratio }));
  }
  return plans;
}
