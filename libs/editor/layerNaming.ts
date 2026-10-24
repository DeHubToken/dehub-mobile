import { groupedSelection } from "./designGroups";
import { resolveClipAt } from "./keyframes";
import type { Clip, ProjectSnapshot } from "./types";
export type LayerNameOrder = "stack" | "reading";
export interface LayerNamePlan { id: string; previous: string | undefined; label: string | undefined }
export function planLayerNames(project: ProjectSnapshot, ids: readonly string[], time: number, pattern: string, start: number, order: LayerNameOrder, clear = false): { plans: LayerNamePlan[]; skipped: number } {
  if (!clear && (!pattern.trim() || pattern.length > 160 || !Number.isInteger(start) || start < 1 || start > 9999)) throw new Error("Enter a name pattern and a starting number from 1 to 9,999");
  if (!clear && /\{(?!name\}|text\}|type\}|n\}|nn\})[^}]*\}/.test(pattern)) throw new Error("Use {name}, {text}, {type}, {n}, or {nn} in the name pattern");
  const chosen = new Set(groupedSelection(project.clips, ids, time)), tracks = new Map(project.tracks.map((track, index) => [track.id, { ...track, index }]));
  const all = project.clips.filter(clip => chosen.has(clip.id) && clip.kind !== "audio" && !clip.isPageBackground && !clip.hidden && !tracks.get(clip.trackId)?.hidden && time >= clip.start && time < clip.start + clip.duration);
  const picked = all.filter(clip => !clip.locked);
  if (!picked.length) throw new Error("Select unlocked foreground layers on this page");
  if (picked.length > 100) throw new Error("Rename up to 100 layers at a time");
  const position = (clip: Clip) => { const at = resolveClipAt(clip, time); if (at.kind === "audio") return { x: 0.5, y: 0.5 }; return at.kind === "text" ? { x: at.x, y: at.y } : { x: at.transform?.x ?? 0.5, y: at.transform?.y ?? 0.5 }; };
  const positions = new Map(picked.map(clip => [clip.id, position(clip)]));
  picked.sort((a, b) => { if (order === "reading") { const first = positions.get(a.id)!, second = positions.get(b.id)!; const delta = first.y - second.y || first.x - second.x; if (delta) return delta; } return (tracks.get(b.trackId)?.index ?? 0) - (tracks.get(a.trackId)?.index ?? 0) || project.clips.indexOf(b) - project.clips.indexOf(a); });
  const plans = picked.map((clip, index) => {
    const text = clip.kind === "text" ? clip.text.replace(/\s+/g, " ").trim() : "", name = clip.label?.trim() || text || tracks.get(clip.trackId)?.name || clip.kind;
    const tokens = { name, text: text || name, type: clip.kind, n: String(start + index), nn: String(start + index).padStart(2, "0") };
    const label = clear ? undefined : pattern.replace(/\{(name|text|type|n|nn)\}/g, (_, token: keyof typeof tokens) => tokens[token]).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80).replace(/[\uD800-\uDBFF]$/, "");
    if (!clear && !label) throw new Error("The name pattern must produce a visible layer name");
    return { id: clip.id, previous: clip.label, label };
  });
  return { plans, skipped: all.length - picked.length };
}
export function applyLayerNames(project: ProjectSnapshot, plans: readonly LayerNamePlan[]): ProjectSnapshot {
  const labels = new Map(plans.map(plan => [plan.id, plan])), clips = project.clips.map(clip => {
    const plan = labels.get(clip.id); return plan && !clip.locked && clip.label === plan.previous && clip.label !== plan.label ? { ...clip, label: plan.label } as Clip : clip;
  });
  return clips.some((clip, index) => clip !== project.clips[index]) ? { ...project, clips } : project;
}
