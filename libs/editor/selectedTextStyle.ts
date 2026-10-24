import { TEXT_EFFECTS, matchesTextEffect, textEffectPatch, type TextEffect } from "./textEffects";
import { textFitPatch, textWrapPatch } from "./textFit";
import { groupedSelection } from "./designGroups";
import { GOOGLE_FONTS } from "./fontCatalogue";
import type { Clip, ProjectSnapshot, TextClip } from "./types";
export type SelectedTextStyle = { kind: "direction"; value: "auto" | "ltr" | "rtl" } | { kind: "effect"; value: TextEffect } | { kind: "wrap" | "fit" | "balance"; value: boolean } | { kind: "bounds"; width: number; height: number } | { kind: "family"; value: string } | { kind: "size" | "lineHeight" | "letterSpacing" | "paragraphSpacing"; value: number } | { kind: "weight"; value: number } | { kind: "colour"; value: string } | { kind: "align"; value: TextClip["align"] } | { kind: "decoration"; property: "italic" | "underline" | "strikethrough"; value: boolean } | { kind: "regular" };
export function selectedDesignText(project: ProjectSnapshot, ids: readonly string[], time: number): TextClip[] {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  return project.clips.filter((clip): clip is TextClip => clip.kind === "text" && chosen.has(clip.id) && !clip.hidden && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
}
export function selectedTextColour(colour: string | undefined): string {
  if (colour && /^#[a-f0-9]{6}$/i.test(colour)) return colour;
  return colour && /^#[a-f0-9]{3}$/i.test(colour) ? "#" + colour.slice(1).split("").map(value => value + value).join("") : "#ffffff";
}
export function applySelectedTextStyle(project: ProjectSnapshot, ids: readonly string[], time: number, operation: SelectedTextStyle) {
  const selected = selectedDesignText(project, ids, time);
  if (!selected.length) throw new Error("Select text layers on the current page");
  if (selected.length > 100) throw new Error("Format up to 100 text layers at a time");
  if (selected.some(clip => clip.locked)) throw new Error("Unlock selected text layers before formatting them");
  if (operation.kind === "effect" && !TEXT_EFFECTS.includes(operation.value)) throw new Error("Choose an available text effect");
  if (operation.kind === "bounds" && [operation.width, operation.height].some(value => !Number.isFinite(value) || value < 0.01 || value > 1)) throw new Error("Use text box dimensions from 1 to 100 percent of the page");
  if (operation.kind === "size" && (!Number.isFinite(operation.value) || operation.value < 6 || operation.value > 1000)) throw new Error("Use a text size from 6 to 1,000");
  if (operation.kind === "lineHeight" && (!Number.isFinite(operation.value) || operation.value < 0.5 || operation.value > 3)) throw new Error("Use line spacing from 0.5 to 3");
  if (operation.kind === "paragraphSpacing" && (!Number.isFinite(operation.value) || operation.value < 0 || operation.value > 300)) throw new Error("Use paragraph spacing from 0 to 300");
  if (operation.kind === "letterSpacing" && (!Number.isFinite(operation.value) || operation.value < -10 || operation.value > 80)) throw new Error("Use letter spacing from −10 to 80");
  if (operation.kind === "weight" && ![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(operation.value)) throw new Error("Choose a supported text weight");
  if (operation.kind === "family" && (!operation.value.trim() || operation.value.length > 500 || /[\u0000-\u001f\u007f]/.test(operation.value))) throw new Error("Choose a valid font family");
  if (operation.kind === "colour" && !/^#[a-f0-9]{6}$/i.test(operation.value)) throw new Error("Use a six-digit hex colour");
  if (operation.kind === "align" && !["left", "centre", "right"].includes(operation.value)) throw new Error("Choose a valid text alignment");
  if (operation.kind === "direction" && !["auto", "ltr", "rtl"].includes(operation.value)) throw new Error("Choose a supported text direction");
  const picked = new Set(selected.map(clip => clip.id));
  const weight = (clip: TextClip, desired: number, override?: string) => { const family = (override ?? clip.fontFamily).split(",")[0].trim().replace(/^['"]|['"]$/g, ""), font = GOOGLE_FONTS.find(font => font.family.toLowerCase() === family.toLowerCase()); return font ? font.weights.reduce((best, value) => Math.abs(value - desired) < Math.abs(best - desired) ? value : best, font.weights[0]) : desired; };
  const clips = project.clips.map((clip): Clip => {
    if (clip.kind !== "text" || !picked.has(clip.id)) return clip;
    if (operation.kind === "effect" && matchesTextEffect(clip, operation.value)) return clip;
    const patch: Partial<TextClip> = operation.kind === "direction" ? { direction: operation.value } : operation.kind === "effect" ? textEffectPatch(clip, operation.value) : operation.kind === "balance" ? { balance: operation.value, ...(operation.value ? textWrapPatch(clip, true) : {}) } : operation.kind === "wrap" ? textWrapPatch(clip, operation.value) : operation.kind === "fit" ? textFitPatch(clip, operation.value) : operation.kind === "bounds" ? { maxWidth: operation.width, maxHeight: operation.height } : operation.kind === "family" ? { fontFamily: operation.value, fontWeight: weight(clip, clip.fontWeight, operation.value) } : operation.kind === "size" ? { fontSize: operation.value } : operation.kind === "lineHeight" ? { lineHeight: operation.value } : operation.kind === "paragraphSpacing" ? { paragraphSpacing: operation.value } : operation.kind === "letterSpacing" ? { letterSpacing: operation.value } : operation.kind === "weight" ? { fontWeight: weight(clip, operation.value) } : operation.kind === "colour" ? { color: operation.value, gradient: null, ...(clip.hollow && clip.stroke ? { stroke: { ...clip.stroke, color: operation.value } } : {}) } : operation.kind === "align" ? { align: operation.value } : operation.kind === "decoration" ? operation.property === "italic" ? { italic: operation.value } : operation.property === "underline" ? { underline: operation.value } : { strikethrough: operation.value } : { fontWeight: weight(clip, 400), italic: false, underline: false, strikethrough: false };
    return Object.entries(patch).some(([key, value]) => clip[key as keyof TextClip] !== value) ? { ...clip, ...patch } : clip;
  });
  return { project: clips.some((clip, index) => clip !== project.clips[index]) ? { ...project, clips } : project, count: selected.length };
}
