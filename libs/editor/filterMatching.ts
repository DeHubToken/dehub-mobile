import type { ClipEffects } from "./types";
const FIELDS: Array<Exclude<keyof ClipEffects, "duotone">> = [
  "brightness", "contrast", "saturation", "blur", "grayscale", "sepia", "hueRotate", "invert",
  "sharpen", "grain", "warmth", "tint", "vignette", "highlights", "shadows", "fade", "vibrance", "scanlines", "halation",
];

/** Neutral explicit values and omitted values describe the same filter. */
export function matchesFilterPreset(current?: ClipEffects, preset?: ClipEffects): boolean {
  const normal = (effects: ClipEffects | undefined, field: typeof FIELDS[number]) => effects?.[field] ?? (["brightness", "contrast", "saturation"].includes(field) ? 1 : 0);
  const a = current?.duotone, b = preset?.duotone;
  const duotone = (!a || a.amount <= 0) && (!b || b.amount <= 0) || !!(a && b && a.dark.toLowerCase() === b.dark.toLowerCase() && a.light.toLowerCase() === b.light.toLowerCase() && Math.abs(a.amount - b.amount) < 0.001);
  return duotone && FIELDS.every(field => Math.abs(normal(current, field) - normal(preset, field)) < 0.001);
}
