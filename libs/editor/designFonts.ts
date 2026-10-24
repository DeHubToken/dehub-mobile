import { graphicFontCss } from "./graphicFonts";
import { GOOGLE_FONTS, type GoogleFont } from "./fontCatalogue";
import type { ProjectSnapshot } from "./types";

const primary = (css: string) => css.split(",")[0].trim().replace(/^['"]|['"]$/g, "");

export function designFonts(project: ProjectSnapshot): { family: string; css: string; count: number }[] {
  const fonts = new Map<string, { family: string; css: string; count: number }>();
  for (const clip of project.clips) {
    const css = clip.kind === "text" ? clip.fontFamily : clip.kind === "shape" && (clip.table || clip.chart) ? graphicFontCss((clip.table ?? clip.chart)?.fontFamily) : null;
    if (!css) continue;
    const family = primary(css), key = family.toLocaleLowerCase();
    const value = fonts.get(key) ?? { family, css, count: 0 };
    value.count++; fonts.set(key, value);
  }
  return [...fonts.values()];
}

export function replaceDesignFont(project: ProjectSnapshot, from: string, target: GoogleFont): ProjectSnapshot {
  if (!GOOGLE_FONTS.some(font => font.family === target.family)) return project;
  const fallback = target.category === "serif" ? "Georgia, 'Times New Roman', serif" : target.category === "monospace" ? "ui-monospace, SFMono-Regular, Menlo, monospace"
    : target.category === "handwriting" ? "cursive" : target.category === "display" ? "system-ui, sans-serif" : "ui-sans-serif, system-ui, sans-serif";
  const fontFamily = `'${target.family}', ${fallback}`, source = primary(from).toLocaleLowerCase();
  let changed = false;
  const clips = project.clips.map(clip => {
    if (clip.locked) return clip;
    if (clip.kind === "shape" && (clip.table || clip.chart)) {
      const graphic = clip.table ?? clip.chart!;
      if ((graphic.fontFamily || "Inter").toLocaleLowerCase() !== source || graphic.fontFamily === target.family) return clip;
      changed = true; return clip.table ? { ...clip, table: { ...clip.table, fontFamily: target.family } } : { ...clip, chart: { ...clip.chart!, fontFamily: target.family } };
    }
    if (clip.kind !== "text" || primary(clip.fontFamily).toLocaleLowerCase() !== source) return clip;
    const fontWeight = target.weights.reduce((best, weight) => Math.abs(weight - clip.fontWeight) < Math.abs(best - clip.fontWeight) ? weight : best, target.weights[0]);
    if (clip.fontFamily === fontFamily && clip.fontWeight === fontWeight) return clip;
    changed = true;
    return { ...clip, fontFamily, fontWeight };
  });
  return changed ? { ...project, clips } : project;
}
