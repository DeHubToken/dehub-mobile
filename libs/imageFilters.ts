/**
 * Photo filters for the post composer — the same presets and sliders as
 * dehubweb's `src/features/post/types/filters.ts`, so a look picked on the
 * phone matches the one picked on the web.
 *
 * The web draws these with a CSS filter string; Skia has no CSS filters, so
 * `filterColorMatrix` builds the equivalent colour matrix from the Filter
 * Effects spec formulas, composed in the order `generateFilterCSS` emits them
 * (brightness, contrast, saturate, grayscale, sepia, hue-rotate). Blur is left
 * out: no preset uses it and neither app exposes a slider for it.
 *
 * No Skia import here — this file is safe to load on builds without Skia.
 */

export interface FilterSettings {
  brightness: number; // 0-200 (100 = normal)
  contrast: number; // 0-200 (100 = normal)
  saturation: number; // 0-200 (100 = normal)
  grayscale: number; // 0-100
  sepia: number; // 0-100
  hueRotate: number; // -180 to 180
  blur: number; // 0-10
}

export interface FilterPreset {
  id: string;
  name: string;
  settings: FilterSettings;
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  blur: 0,
};

const preset = (id: string, name: string, s: Omit<FilterSettings, "blur">): FilterPreset => ({
  id,
  name,
  settings: { ...s, blur: 0 },
});

// Names are product names (the web's anagrams), not words, so they are not translated.
export const FILTER_PRESETS: FilterPreset[] = [
  preset("normal", "Marlon", { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, hueRotate: 0 }),
  preset("clarendon", "Cradled", { brightness: 110, contrast: 120, saturation: 125, grayscale: 0, sepia: 0, hueRotate: 0 }),
  preset("gingham", "Hamging", { brightness: 105, contrast: 90, saturation: 90, grayscale: 0, sepia: 5, hueRotate: 0 }),
  preset("moon", "Mono", { brightness: 110, contrast: 110, saturation: 100, grayscale: 100, sepia: 0, hueRotate: 0 }),
  preset("lark", "Karl", { brightness: 110, contrast: 90, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 0 }),
  preset("reyes", "Seery", { brightness: 110, contrast: 85, saturation: 75, grayscale: 0, sepia: 20, hueRotate: 0 }),
  preset("juno", "Ujon", { brightness: 105, contrast: 115, saturation: 140, grayscale: 0, sepia: 0, hueRotate: 0 }),
  preset("slumber", "Rumbles", { brightness: 105, contrast: 95, saturation: 65, grayscale: 0, sepia: 10, hueRotate: 0 }),
  preset("crema", "Cream", { brightness: 105, contrast: 95, saturation: 90, grayscale: 0, sepia: 15, hueRotate: 0 }),
  preset("ludwig", "Guilwd", { brightness: 105, contrast: 105, saturation: 95, grayscale: 0, sepia: 10, hueRotate: 0 }),
  preset("aden", "Dean", { brightness: 115, contrast: 90, saturation: 85, grayscale: 0, sepia: 15, hueRotate: 20 }),
  preset("perpetua", "Reappute", { brightness: 105, contrast: 100, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -10 }),
  preset("amaro", "Aroma", { brightness: 110, contrast: 90, saturation: 150, grayscale: 0, sepia: 0, hueRotate: -10 }),
  preset("mayfair", "Fyraim", { brightness: 105, contrast: 110, saturation: 110, grayscale: 0, sepia: 5, hueRotate: 0 }),
  preset("rise", "Sire", { brightness: 110, contrast: 90, saturation: 90, grayscale: 0, sepia: 20, hueRotate: 0 }),
  preset("hudson", "Shundo", { brightness: 120, contrast: 90, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -10 }),
  preset("valencia", "Valiance", { brightness: 108, contrast: 108, saturation: 85, grayscale: 0, sepia: 15, hueRotate: 0 }),
  preset("xpro2", "Proxii", { brightness: 100, contrast: 130, saturation: 120, grayscale: 0, sepia: 15, hueRotate: 0 }),
  preset("sierra", "Raiser", { brightness: 100, contrast: 90, saturation: 80, grayscale: 0, sepia: 15, hueRotate: 0 }),
  preset("willow", "Lowwil", { brightness: 105, contrast: 95, saturation: 5, grayscale: 80, sepia: 0, hueRotate: 0 }),
  preset("lofi", "Foil", { brightness: 100, contrast: 150, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 0 }),
  preset("inkwell", "Wellkin", { brightness: 110, contrast: 110, saturation: 0, grayscale: 100, sepia: 10, hueRotate: 0 }),
  preset("hefe", "Feeh", { brightness: 105, contrast: 100, saturation: 120, grayscale: 0, sepia: 10, hueRotate: 0 }),
  preset("nashville", "Vanilles", { brightness: 105, contrast: 120, saturation: 110, grayscale: 0, sepia: 20, hueRotate: -20 }),
];

export function hasFilterApplied(s?: FilterSettings): boolean {
  if (!s) return false;
  return (
    s.brightness !== 100 ||
    s.contrast !== 100 ||
    s.saturation !== 100 ||
    s.grayscale !== 0 ||
    s.sepia !== 0 ||
    s.hueRotate !== 0
  );
}

/** A 3x3 colour transform plus an RGB offset (offsets in 0..1). */
type Affine = { m: number[]; t: [number, number, number] };

const scaleOf = (k: number, t = 0): Affine => ({ m: [k, 0, 0, 0, k, 0, 0, 0, k], t: [t, t, t] });

/** `next` applied after `prev`. */
function then(prev: Affine, next: Affine): Affine {
  const a = next.m;
  const b = prev.m;
  const m = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  const t: [number, number, number] = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    t[r] = a[r * 3] * prev.t[0] + a[r * 3 + 1] * prev.t[1] + a[r * 3 + 2] * prev.t[2] + next.t[r];
  }
  return { m, t };
}

function saturate(s: number): Affine {
  return {
    m: [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    ],
    t: [0, 0, 0],
  };
}

function grayscale(g: number): Affine {
  const a = 1 - Math.min(1, g);
  return {
    m: [
      0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a,
      0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a,
      0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a,
    ],
    t: [0, 0, 0],
  };
}

function sepia(s: number): Affine {
  const a = 1 - Math.min(1, s);
  return {
    m: [
      0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
      0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
      0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
    ],
    t: [0, 0, 0],
  };
}

function hueRotate(deg: number): Affine {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return {
    m: [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ],
    t: [0, 0, 0],
  };
}

/** The 4x5 row-major RGBA matrix Skia's colour-matrix filter takes. */
export function filterColorMatrix(s: FilterSettings): number[] {
  let x = scaleOf(1);
  if (s.brightness !== 100) x = then(x, scaleOf(s.brightness / 100));
  if (s.contrast !== 100) {
    const k = s.contrast / 100;
    x = then(x, scaleOf(k, 0.5 - 0.5 * k));
  }
  if (s.saturation !== 100) x = then(x, saturate(s.saturation / 100));
  if (s.grayscale > 0) x = then(x, grayscale(s.grayscale / 100));
  if (s.sepia > 0) x = then(x, sepia(s.sepia / 100));
  if (s.hueRotate !== 0) x = then(x, hueRotate(s.hueRotate));
  const { m, t } = x;
  return [
    m[0], m[1], m[2], 0, t[0],
    m[3], m[4], m[5], 0, t[1],
    m[6], m[7], m[8], 0, t[2],
    0, 0, 0, 1, 0,
  ];
}

// ── Photo studio ───────────────────────────────────────────────────────────
//
// The composer's photo studio keeps every edit as settings over the original
// picture (look + strength, adjust dials, crop, marks) and only bakes them when
// the creator taps Done, so any tool can be changed again in any order.

/** Looks, by plain name. Ids are the old preset ids so saved drafts still match. */
export interface StudioLook {
  id: string;
  name: string;
  settings: FilterSettings;
  /** Extra warmth (-100..100) the look carries, applied with the adjust dials. */
  warmth?: number;
}

const look = (id: string, name: string, s: Partial<FilterSettings>, warmth = 0): StudioLook => ({
  id,
  name,
  settings: { ...DEFAULT_FILTER_SETTINGS, ...s },
  warmth,
});

export const STUDIO_LOOKS: StudioLook[] = [
  look("normal", "Original", {}),
  look("clarendon", "Vivid", { brightness: 108, contrast: 118, saturation: 128 }),
  look("valencia", "Golden", { brightness: 106, contrast: 104, saturation: 110 }, 65),
  look("lark", "Fresh", { brightness: 110, contrast: 92, saturation: 112 }),
  look("gingham", "Soft", { brightness: 106, contrast: 88, saturation: 88 }),
  look("crema", "Cream", { brightness: 105, contrast: 94, saturation: 90, sepia: 12 }),
  look("reyes", "Faded", { brightness: 110, contrast: 84, saturation: 76, sepia: 14 }),
  look("perpetua", "Cool", { brightness: 104, contrast: 102, saturation: 96 }, -65),
  look("lofi", "Bold", { brightness: 100, contrast: 145, saturation: 112 }),
  look("nashville", "Retro", { brightness: 105, contrast: 112, saturation: 104, sepia: 22 }, 10),
  look("sierra", "Muted", { brightness: 100, contrast: 90, saturation: 70, sepia: 10 }),
  look("moon", "Mono", { brightness: 108, contrast: 110, grayscale: 100 }),
  look("inkwell", "Noir", { brightness: 104, contrast: 132, grayscale: 100 }),
];

export function studioLook(id?: string | null): StudioLook {
  return STUDIO_LOOKS.find((l) => l.id === id) ?? STUDIO_LOOKS[0];
}

/** The adjust dials, each -100..100 (fade and vignette 0..100), 0 = untouched. */
export interface StudioAdjust {
  light: number;
  contrast: number;
  warmth: number;
  tint: number;
  colour: number;
  fade: number;
  vignette: number;
}

export const DEFAULT_ADJUST: StudioAdjust = { light: 0, contrast: 0, warmth: 0, tint: 0, colour: 0, fade: 0, vignette: 0 };

export type StudioAdjustKey = keyof StudioAdjust;

export const ADJUST_RANGES: Record<StudioAdjustKey, [number, number]> = {
  light: [-100, 100],
  contrast: [-100, 100],
  warmth: [-100, 100],
  tint: [-100, 100],
  colour: [-100, 100],
  fade: [0, 100],
  vignette: [0, 100],
};

/** A look blended toward Original by `strength` (0..100). */
export function lookAtStrength(l: StudioLook, strength: number): FilterSettings {
  const k = Math.max(0, Math.min(100, strength)) / 100;
  const d = DEFAULT_FILTER_SETTINGS;
  const s = l.settings;
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    brightness: mix(d.brightness, s.brightness),
    contrast: mix(d.contrast, s.contrast),
    saturation: mix(d.saturation, s.saturation),
    grayscale: mix(d.grayscale, s.grayscale),
    sepia: mix(d.sepia, s.sepia),
    hueRotate: mix(d.hueRotate, s.hueRotate),
    blur: 0,
  };
}

/** a then b, both 4x5 row-major RGBA matrices with offsets in 0..1. */
export function chainMatrix(a: number[], b: number[]): number[] {
  const out = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += b[r * 5 + k] * a[k * 5 + c];
      out[r * 5 + c] = v;
    }
    let t = b[r * 5 + 4];
    for (let k = 0; k < 4; k++) t += b[r * 5 + k] * a[k * 5 + 4];
    out[r * 5 + 4] = t;
  }
  return out;
}

const diag = (r: number, g: number, b: number, off: [number, number, number] = [0, 0, 0]) => [
  r, 0, 0, 0, off[0],
  0, g, 0, 0, off[1],
  0, 0, b, 0, off[2],
  0, 0, 0, 1, 0,
];

/** The adjust dials as one colour matrix (vignette is drawn separately). */
export function adjustMatrix(a: StudioAdjust): number[] {
  let m = diag(1, 1, 1);
  if (a.light) {
    const k = 1 + a.light / 200;
    m = chainMatrix(m, diag(k, k, k));
  }
  if (a.contrast) {
    const k = 1 + a.contrast / 200;
    const o = 0.5 - 0.5 * k;
    m = chainMatrix(m, diag(k, k, k, [o, o, o]));
  }
  if (a.colour) {
    const s = Math.max(0, 1 + a.colour / 100);
    m = chainMatrix(m, [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0,
      0, 0, 0, 1, 0,
    ]);
  }
  if (a.warmth) {
    // Warm pushes red up and blue down; cool the reverse. Green barely moves,
    // so skin stays skin (the old "warmth" spun the hue wheel instead).
    const w = a.warmth / 100;
    m = chainMatrix(m, diag(1 + 0.18 * w, 1 + 0.05 * w, 1 - 0.18 * w));
  }
  if (a.tint) {
    const t = a.tint / 100;
    m = chainMatrix(m, diag(1 + 0.05 * t, 1 - 0.1 * t, 1 + 0.05 * t));
  }
  if (a.fade) {
    // Lift the blacks and soften the whites, like a washed print.
    const f = a.fade / 100;
    const k = 1 - 0.22 * f;
    const o = 0.14 * f;
    m = chainMatrix(m, diag(k, k, k, [o, o, o]));
  }
  return m;
}

/** Look (at strength) then adjust dials, as one matrix, or null when it changes nothing. */
export function studioColorMatrix(lookId: string | undefined, strength: number, adjust: StudioAdjust): number[] | null {
  const l = studioLook(lookId);
  const lookSettings = lookAtStrength(l, strength);
  const warmth = (l.warmth ?? 0) * (strength / 100) + adjust.warmth;
  const merged = { ...adjust, warmth: Math.max(-100, Math.min(100, warmth)) };
  const lookChanges = hasFilterApplied(lookSettings);
  const adjustChanges = (Object.keys(merged) as StudioAdjustKey[]).some((k) => k !== "vignette" && merged[k] !== 0);
  if (!lookChanges && !adjustChanges) return null;
  const base = lookChanges ? filterColorMatrix(lookSettings) : diag(1, 1, 1);
  return chainMatrix(base, adjustMatrix(merged));
}
