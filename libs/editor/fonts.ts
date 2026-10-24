/** Font loading uses the shared catalogue so saved text keeps its supported weights on either device. */
import { GOOGLE_FONTS, type GoogleFont } from "./fontCatalogue";
export type EditorFont = GoogleFont;
export const EDITOR_FONTS: EditorFont[] = GOOGLE_FONTS;


/** First family in a CSS font-family value, unquoted. Same as the web's primaryFamily. */
export function primaryFamily(css: string): string {
  const first = css.split(",")[0] ?? css;
  return first.trim().replace(/^['"]|['"]$/g, "");
}

/** CSS font-family with the web's fallbacks for the category. */
export function fontFamilyCss(font: EditorFont): string {
  const fallback =
    font.category === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : font.category === "monospace"
      ? "ui-monospace, SFMono-Regular, Menlo, monospace"
      : font.category === "handwriting"
      ? "cursive"
      : font.category === "display"
      ? "system-ui, sans-serif"
      : "ui-sans-serif, system-ui, sans-serif";
  return `'${font.family}', ${fallback}`;
}

export function findFont(css: string): EditorFont | null {
  const name = primaryFamily(css).toLowerCase();
  return EDITOR_FONTS.find((f) => f.family.toLowerCase() === name) ?? null;
}

const GENERIC = new Set([
  "ui-sans-serif", "system-ui", "sans-serif", "serif", "monospace", "cursive",
  "ui-monospace", "georgia", "times new roman", "menlo", "sfmono-regular",
]);

/**
 * Google Fonts stylesheet for a family. Only weights the family has are asked
 * for, because the API refuses the whole request over one it lacks. A family
 * that came from a web project and is not in the list above gets its regular
 * weight, which every Google font has.
 */
export function fontStylesheet(css: string): string | null {
  const family = primaryFamily(css);
  if (!family || GENERIC.has(family.toLowerCase())) return null;
  const known = findFont(css);
  const name = family.trim().replace(/\s+/g, "+");
  if (!known) return `https://fonts.googleapis.com/css2?family=${name}&display=swap`;
  const weights = known.weights.slice().sort((a, b) => a - b).join(";");
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${weights}&display=swap`;
}

/** The closest weight the family has, so bold never asks for a missing file. */
export function nearestWeight(css: string, wanted: number): number {
  const known = findFont(css);
  if (!known) return wanted;
  return known.weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), known.weights[0]);
}
