import { GOOGLE_FONTS } from "./fontCatalogue";
import type { Clip } from "./types";
export function validGraphicFont(value: unknown): boolean { return value === undefined || typeof value === "string" && GOOGLE_FONTS.some(font => font.family === value); }
export function clipFontFamilies(clips: readonly Clip[]): string[] {
  return [...new Set(clips.flatMap(clip => clip.kind === "text" ? [clip.fontFamily] : clip.kind === "shape" && (clip.chart || clip.table) ? [graphicFontCss((clip.table ?? clip.chart)?.fontFamily)] : []))];
}
export function graphicFontCss(value?: string): string {
  const name = typeof value === "string" ? value.slice(0, 100).replace(/[^a-z0-9 ._-]/gi, "") : "";
  return '"' + (name || "Inter") + '", sans-serif';
}
