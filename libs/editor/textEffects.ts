import type { TextClip } from "./types";

export const TEXT_EFFECTS = ["none", "shadow", "lift", "hollow", "neon", "label"] as const;
export type TextEffect = (typeof TEXT_EFFECTS)[number];
export const TEXT_EFFECT_NAMES: Record<TextEffect, string> = { none: "None", shadow: "Shadow", lift: "Lift", hollow: "Hollow", neon: "Neon", label: "Label" };

/** Named effects are ordinary editable style values, so previews and exports share the same result. */
export function textEffectPatch(clip: TextClip, effect: TextEffect): Partial<TextClip> {
  const reset = { hollow: false, shadow: null, stroke: null, background: null };
  if (effect === "shadow") return { ...reset, shadow: { color: "#000000", opacity: 0.65, blur: 4, offsetX: 7, offsetY: 7 } };
  if (effect === "lift") return { ...reset, shadow: { color: "#000000", opacity: 0.7, blur: 36, offsetX: 0, offsetY: 12 } };
  if (effect === "hollow") return { ...reset, hollow: true, stroke: { color: clip.color, width: 3 } };
  if (effect === "neon") return { ...reset, shadow: { color: clip.color, opacity: 1, blur: 30, offsetX: 0, offsetY: 0 }, stroke: { color: "#ffffff", width: 1 } };
  if (effect === "label") return { ...reset, background: { color: "#000000", opacity: 0.8, padding: 24, radius: 12 } };
  return reset;
}
