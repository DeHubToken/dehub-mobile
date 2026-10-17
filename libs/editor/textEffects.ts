import type { TextClip } from "./types";

export const TEXT_EFFECTS = ["none", "shadow", "lift", "hollow", "neon", "label", "echo", "glitch", "outline"] as const;
export type TextEffect = (typeof TEXT_EFFECTS)[number];
export const TEXT_EFFECT_NAMES: Record<TextEffect, string> = { none: "None", shadow: "Shadow", lift: "Lift", hollow: "Hollow", neon: "Neon", label: "Label", echo: "Echo", glitch: "Glitch", outline: "Outline" };

/** Named effects are ordinary editable style values, so previews and exports share the same result. */
export function textEffectPatch(clip: TextClip, effect: TextEffect): Partial<TextClip> {
  const reset = { echo: undefined, hollow: false, shadow: null, stroke: null, background: null };
  if (effect === "shadow") return { ...reset, shadow: { color: "#000000", opacity: 0.65, blur: 4, offsetX: 7, offsetY: 7 } };
  if (effect === "lift") return { ...reset, shadow: { color: "#000000", opacity: 0.7, blur: 36, offsetX: 0, offsetY: 12 } };
  if (effect === "hollow") return { ...reset, hollow: true, stroke: { color: clip.color, width: 3 } };
  if (effect === "neon") return { ...reset, shadow: { color: clip.color, opacity: 1, blur: 30, offsetX: 0, offsetY: 0 }, stroke: { color: "#ffffff", width: 1 } };
  if (effect === "echo") return { ...reset, echo: [{ colour: clip.color, x: 8, y: 8, opacity: 0.35 }, { colour: clip.color, x: 16, y: 16, opacity: 0.15 }] };
  if (effect === "glitch") return { ...reset, echo: [{ colour: "#22d3ee", x: -5, y: 0, opacity: 0.85 }, { colour: "#fb7185", x: 5, y: 0, opacity: 0.85 }] };
  if (effect === "outline") return { ...reset, stroke: { color: clip.color.toLowerCase() === "#ffffff" ? "#111111" : "#ffffff", width: 8 } };
  if (effect === "label") return { ...reset, background: { color: "#000000", opacity: 0.8, padding: 24, radius: 12 } };
  return reset;
}

export function matchesTextEffect(clip: TextClip, effect: TextEffect): boolean {
  const expected = { ...clip, ...textEffectPatch(clip, effect) };
  const key = (value: TextClip) => JSON.stringify([value.echo?.length ? value.echo : null, !!value.hollow, value.shadow ?? null, value.stroke ?? null, value.background ?? null]);
  return key(clip) === key(expected);
}
