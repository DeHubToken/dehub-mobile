/**
 * Brand kit: colours, a heading and body font, and a logo picture. Kept on
 * the phone (AsyncStorage) like the web keeps it in the browser. applyBrand
 * follows the web's rules (dehubweb src/lib/editor/brand.ts): text of 100px
 * and up is a heading, text only takes a brand colour that reads on the page
 * background (3:1), shapes take brand colours in turn.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateClip } from "./project";
import type { ProjectSnapshot } from "./types";

export interface BrandKit {
  colors: string[];
  /** CSS font-family values. */
  headingFont: string | null;
  bodyFont: string | null;
  logoMediaId: string | null;
}

const KEY = "dehub.editor.brandKit.v1";
export const EMPTY_BRAND: BrandKit = { colors: [], headingFont: null, bodyFont: null, logoMediaId: null };
export const MAX_BRAND_COLORS = 10;

export async function loadBrand(): Promise<BrandKit> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY_BRAND;
    const v = JSON.parse(raw) as Partial<BrandKit>;
    return {
      colors: Array.isArray(v.colors) ? v.colors.filter((c) => typeof c === "string").slice(0, MAX_BRAND_COLORS) : [],
      headingFont: typeof v.headingFont === "string" ? v.headingFont : null,
      bodyFont: typeof v.bodyFont === "string" ? v.bodyFont : null,
      logoMediaId: typeof v.logoMediaId === "string" ? v.logoMediaId : null,
    };
  } catch {
    return EMPTY_BRAND;
  }
}

export async function saveBrand(kit: BrandKit): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(kit));
  } catch {
    /* storage full or unavailable: the kit lasts for this session */
  }
}

export function hasBrand(kit: BrandKit | null): boolean {
  return !!kit && (kit.colors.length > 0 || !!kit.headingFont || !!kit.bodyFont || !!kit.logoMediaId);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return 0.5;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Restyle the whole design with the kit. Pure: returns a new snapshot. */
export function applyBrand(p: ProjectSnapshot, kit: BrandKit): ProjectSnapshot {
  const bg = p.settings.background;
  const readable = kit.colors.filter((c) => contrast(c, bg) >= 3);
  const fallbackText = luminance(bg) > 0.4 ? "#111111" : "#ffffff";
  let out = p;
  let shapeIdx = 0;
  let textIdx = 0;
  for (const c of p.clips) {
    if (c.kind === "text") {
      const heading = c.fontSize >= 100;
      const font = heading ? kit.headingFont ?? kit.bodyFont : kit.bodyFont ?? kit.headingFont;
      const color = readable.length ? readable[textIdx++ % readable.length] : kit.colors.length ? fallbackText : undefined;
      const patch: Record<string, unknown> = {};
      if (font) patch.fontFamily = font;
      if (color) patch.color = color;
      if (Object.keys(patch).length) out = updateClip(out, c.id, patch);
    } else if (c.kind === "shape" && kit.colors.length) {
      const color = kit.colors[shapeIdx++ % kit.colors.length];
      const patch: Record<string, unknown> = {};
      if (c.fill) patch.fill = color;
      if (c.stroke) patch.stroke = { ...c.stroke, color };
      if (Object.keys(patch).length) out = updateClip(out, c.id, patch);
    }
  }
  return out;
}
