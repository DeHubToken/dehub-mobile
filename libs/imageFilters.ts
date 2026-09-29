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
