export interface PhotoTone {
  vibrance?: number;
  highlights?: number;
  shadows?: number;
  fade?: number;
  duotone?: { dark: string; light: string; amount: number } | null;
}
export const DUOTONE_PRESETS = [
  { id: "ink", label: "Ink", dark: "#182132", light: "#f5e8ce" },
  { id: "cobalt", label: "Cobalt", dark: "#172554", light: "#7dd3fc" },
  { id: "cherry", label: "Cherry", dark: "#4c0519", light: "#fecdd3" },
  { id: "emerald", label: "Emerald", dark: "#022c22", light: "#a7f3d0" },
  { id: "violet", label: "Violet", dark: "#2e1065", light: "#f5d0fe" },
  { id: "mono", label: "Monochrome", dark: "#111111", light: "#ffffff" },
] as const;

export function validPhotoTone(value: PhotoTone): boolean {
  const bounded = (value: unknown, min: number, max: number) => value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);
  const duo = value.duotone;
  return bounded(value.vibrance, -1, 1) && bounded(value.highlights, -1, 1) && bounded(value.shadows, -1, 1) && bounded(value.fade, 0, 1) &&
    (duo === undefined || duo === null || (typeof duo === "object" && /^#[\da-f]{6}$/i.test(duo.dark) && /^#[\da-f]{6}$/i.test(duo.light) && typeof duo.amount === "number" && Number.isFinite(duo.amount) && duo.amount >= 0 && duo.amount <= 1));
}

export function needsPhotoTone(value: PhotoTone): boolean {
  return !!(value.vibrance || value.highlights || value.shadows || value.fade || (value.duotone && value.duotone.amount > 0));
}

/** Process a bounded crop once; the compositor caches still-image results by source and style. */
export function applyPhotoTone(pixels: Uint8ClampedArray, value: PhotoTone, opaque = false): void {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
  const highlights = clamp(value.highlights ?? 0, -1, 1), shadows = clamp(value.shadows ?? 0, -1, 1), fade = clamp(value.fade ?? 0, 0, 1);
  const vibrance = clamp(value.vibrance ?? 0, -1, 1);
  const duo = value.duotone;
  const amount = duo && /^#[\da-f]{6}$/i.test(duo.dark) && /^#[\da-f]{6}$/i.test(duo.light) ? clamp(duo.amount, 0, 1) : 0;
  const dark = amount ? parseInt(duo!.dark.slice(1), 16) : 0, light = amount ? parseInt(duo!.light.slice(1), 16) : 0;
  const dr = dark >> 16 & 255, dg = dark >> 8 & 255, db = dark & 255;
  const lr = light >> 16 & 255, lg = light >> 8 & 255, lb = light & 255;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
    const shift = 76 * (shadows * (1 - luminance) ** 2 + highlights * luminance ** 2);
    let r = clamp(pixels[index] + shift, 0, 255), g = clamp(pixels[index + 1] + shift, 0, 255), b = clamp(pixels[index + 2] + shift, 0, 255);
    if (vibrance) {
      const peak = Math.max(r, g, b), saturation = peak > 0 ? (peak - Math.min(r, g, b)) / peak : 0;
      const strength = 1 + (vibrance > 0 ? vibrance * (1 - saturation) * 0.75 : vibrance), grey = r * 0.2126 + g * 0.7152 + b * 0.0722;
      r = clamp(grey + (r - grey) * strength, 0, 255); g = clamp(grey + (g - grey) * strength, 0, 255); b = clamp(grey + (b - grey) * strength, 0, 255);
    }
    const level = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    if (amount) {
      r += (dr + (lr - dr) * level - r) * amount;
      g += (dg + (lg - dg) * level - g) * amount;
      b += (db + (lb - db) * level - b) * amount;
    }
    pixels[index] = r * (1 - fade * 0.3) + fade * 48;
    pixels[index + 1] = g * (1 - fade * 0.3) + fade * 48;
    pixels[index + 2] = b * (1 - fade * 0.3) + fade * 48;
    if (opaque) pixels[index + 3] = 255;
  }
}
