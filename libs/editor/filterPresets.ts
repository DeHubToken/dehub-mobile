import { matchesFilterPreset } from "./filterMatching";
/**
 * Filter presets, the same values as dehubweb src/lib/editor/filterPresets.ts.
 * Each one is a set of ClipEffects, so a filter picked here renders the same on
 * the web. Names are translated through `editor.filters.<id>`.
 */
import type { ClipEffects } from "./types";

export interface FilterPreset {
  id: string;
  label?: string;
  effects: ClipEffects;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", effects: {} },
  { id: "natural", label: "Natural", effects: { vibrance: 0.4, highlights: -0.12, shadows: 0.1, contrast: 1.03 } },
  { id: "softLight", label: "Soft light", effects: { vibrance: 0.2, highlights: -0.2, shadows: 0.2, warmth: 0.08, fade: 0.08 } },
  { id: "crisp", label: "Crisp", effects: { vibrance: 0.5, contrast: 1.12, highlights: -0.08, shadows: -0.08 } },
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
  { id: "fadedFilm", label: "Faded film", effects: { fade: 0.35, contrast: 0.92, saturation: 0.8, warmth: 0.2, grain: 0.35, halation: 0.35, vignette: 0.25 } },
  { id: "technicolor", label: "Technicolor", effects: { saturation: 1.45, contrast: 1.12, vibrance: 0.3, warmth: 0.12, tint: 0.08, halation: 0.2 } },
  { id: "newsreel", label: "Newsreel", effects: { grayscale: 1, contrast: 1.25, brightness: 0.95, grain: 0.6, vignette: 0.55, sepia: 0.12 } },
  { id: "vhs", label: "VHS", effects: { saturation: 1.15, contrast: 1.05, tint: 0.12, blur: 0.6, scanlines: 0.55, grain: 0.25 } },
];

/** A preset's effects by id, as the web's applyFilterPreset. */
export function applyFilterPreset(id: string): ClipEffects | undefined {
  const p = FILTER_PRESETS.find((x) => x.id === id);
  return p ? { ...p.effects } : undefined;
}

/** The preset whose effects match exactly, so the picker can show the current one. */
export function matchPreset(effects: ClipEffects | undefined): string | null {
  return FILTER_PRESETS.find(preset => matchesFilterPreset(effects, preset.effects))?.id ?? null;
}
