/**
 * Brand kit: colours, a heading and body font, and a logo picture. Kept on
 * the phone (AsyncStorage) like the web keeps it in the browser. applyBrand
 * follows the web's rules (dehubweb src/lib/editor/brand.ts): text of 100px
 * and up is a heading, text only takes a brand colour that reads on the page
 * background (3:1), shapes take brand colours in turn.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyBrandStyles } from "./brandStyles";
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

/** Restyle the whole design with the kit. Pure: returns a new snapshot. */
export function applyBrand(p: ProjectSnapshot, kit: BrandKit): ProjectSnapshot {
  return applyBrandStyles(p, kit);
}

/** The official DeHub look, same as web: monochrome palette, Exo headings, Inter body, white wordmark. */
export const DEHUB_BRAND_COLORS = ["#ffffff", "#c9ccd1", "#6b6f76", "#1a1b1e", "#000000"];
export const DEHUB_BRAND_FONTS = {
  heading: "'Exo', ui-sans-serif, system-ui, sans-serif",
  body: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
export const DEHUB_LOGO_URL = "https://dehub.io/brand-kit/brand/wordmark-white.png";
