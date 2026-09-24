/**
 * Filter presets, the same values as dehubweb src/lib/editor/filterPresets.ts.
 * Each one is a set of ClipEffects, so a filter picked here renders the same on
 * the web. Names are translated through `editor.filters.<id>`.
 */
import type { ClipEffects } from "./types";

export interface FilterPreset {
  id: string;
  effects: ClipEffects;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", effects: {} },
  { id: "cinematic", effects: { contrast: 1.15, saturation: 1.1, brightness: 0.95, warmth: 0.1, vignette: 0.3 } },
  { id: "warm", effects: { saturation: 1.1, brightness: 1.03, warmth: 0.55 } },
  { id: "cool", effects: { saturation: 1.05, brightness: 1.02, warmth: -0.5 } },
  { id: "vintage", effects: { sepia: 0.35, saturation: 0.85, contrast: 1.05, warmth: 0.25, vignette: 0.4 } },
  { id: "bw", effects: { grayscale: 1, contrast: 1.1 } },
  { id: "sepia", effects: { sepia: 0.85, contrast: 1.05 } },
  { id: "dreamy", effects: { blur: 1.5, brightness: 1.08, saturation: 1.1 } },
  { id: "punchy", effects: { contrast: 1.3, saturation: 1.35 } },
  { id: "faded", effects: { contrast: 0.85, saturation: 0.75, brightness: 1.05 } },
  { id: "noir", effects: { grayscale: 1, contrast: 1.4, brightness: 0.9, vignette: 0.5 } },
  { id: "sunny", effects: { brightness: 1.12, saturation: 1.2, warmth: 0.35 } },
  { id: "moody", effects: { brightness: 0.85, contrast: 1.2, saturation: 0.9, warmth: -0.15, vignette: 0.45 } },
  { id: "vibrant", effects: { saturation: 1.5, contrast: 1.1 } },
  { id: "cyber", effects: { hueRotate: 220, saturation: 1.4, contrast: 1.15 } },
  { id: "invert", effects: { invert: 1 } },
];

/** A preset's effects by id, as the web's applyFilterPreset. */
export function applyFilterPreset(id: string): ClipEffects | undefined {
  const p = FILTER_PRESETS.find((x) => x.id === id);
  return p ? { ...p.effects } : undefined;
}

/** The preset whose effects match exactly, so the picker can show the current one. */
export function matchPreset(effects: ClipEffects | undefined): string | null {
  const e = effects ?? {};
  const keys = (x: ClipEffects) => Object.keys(x).filter((k) => x[k as keyof ClipEffects] !== undefined).sort();
  for (const p of FILTER_PRESETS) {
    const a = keys(e);
    const b = keys(p.effects);
    if (a.length === b.length && a.every((k, i) => k === b[i] && e[k as keyof ClipEffects] === p.effects[k as keyof ClipEffects])) {
      return p.id;
    }
  }
  return null;
}
