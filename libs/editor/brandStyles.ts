import { GOOGLE_FONTS } from "./fontCatalogue";
import type { Clip, ProjectSnapshot } from "./types";
export interface BrandStyles { colors: string[]; headingFont: string | null; bodyFont: string | null }

export function validBrandStyles(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const styles = value as Record<string, unknown>;
  return Array.isArray(styles.colors) && styles.colors.length <= 10 && styles.colors.every(color => typeof color === "string" && /^#([\da-f]{3}|[\da-f]{6})$/i.test(color)) &&
    [styles.headingFont, styles.bodyFont].every(font => font === null || (typeof font === "string" && font.length <= 500));
}

export function normaliseBrandStyles(value: BrandStyles): BrandStyles {
  return { colors: [...new Set(value.colors.filter(color => /^#([\da-f]{3}|[\da-f]{6})$/i.test(color)).map(color => color.length === 4 ? "#" + color.slice(1).split("").map(c => c + c).join("").toLowerCase() : color.toLowerCase()))].slice(0, 10),
    headingFont: value.headingFont?.slice(0, 500) || null, bodyFont: value.bodyFont?.slice(0, 500) || null };
}

function luminance(hex: string) {
  const raw = hex.replace("#", ""), normalized = raw.length === 3 ? raw.split("").map(c => c + c).join("") : raw;
  const number = parseInt(normalized, 16);
  if (!Number.isFinite(number)) return 0.5;
  const channels = [(number >> 16) & 255, (number >> 8) & 255, number & 255].map(value => value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function readableColour(colors: string[], background: string, index: number) {
  const choices = colors.filter(color => contrast(color, background) >= 3);
  return choices.length ? choices[index % choices.length] : luminance(background) > 0.4 ? "#111111" : "#ffffff";
}

/** Brand application has identical rules for every saved graphic on web and mobile. */
export function applyBrandStyles(project: ProjectSnapshot, input: BrandStyles): ProjectSnapshot {
  const brand = normaliseBrandStyles(input);
  if (!brand.colors.length && !brand.headingFont && !brand.bodyFont) return project;
  const requestedGraphicFamily = (brand.bodyFont || brand.headingFont)?.split(",")[0].trim().replace(/^['"]|['"]$/g, ""), graphicFamily = requestedGraphicFamily ? GOOGLE_FONTS.find(font => font.family.toLowerCase() === requestedGraphicFamily.toLowerCase())?.family : undefined;
  let textIndex = 0, shapeIndex = 0;
  const clips = project.clips.map((clip): Clip => {
    if (clip.locked || clip.kind === "audio") return clip;
    if (clip.kind === "text") {
      const fontFamily = (clip.fontSize >= 100 ? brand.headingFont ?? brand.bodyFont : brand.bodyFont ?? brand.headingFont) || clip.fontFamily;
      const family = fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
      const font = GOOGLE_FONTS.find(value => value.family.toLowerCase() === family.toLowerCase());
      const requestedWeight = clip.fontWeight;
      const fontWeight = font ? font.weights.reduce((best, weight) => Math.abs(weight - requestedWeight) < Math.abs(best - requestedWeight) ? weight : best, font.weights[0]) : clip.fontWeight;
      if (!brand.colors.length) return { ...clip, fontFamily, fontWeight };
      const background = clip.background && clip.background.opacity >= 0.7 ? clip.background.color : project.settings.background;
      const color = readableColour(brand.colors, background, textIndex++);
      return { ...clip, fontFamily, fontWeight, color, gradient: null, echo: clip.echo?.map((layer, index) => ({ ...layer, colour: brand.colors[index % brand.colors.length] })),
        ...(clip.hollow && clip.stroke ? { stroke: { ...clip.stroke, color } } : {}) };
    }
    if (clip.kind === "shape" && graphicFamily && (clip.table || clip.chart)) clip = { ...clip, ...(clip.table ? { table: { ...clip.table, fontFamily: graphicFamily } } : {}), ...(clip.chart ? { chart: { ...clip.chart, fontFamily: graphicFamily } } : {}) };
    if (!brand.colors.length) return clip;
    const color = brand.colors[shapeIndex++ % brand.colors.length];
    if (clip.kind !== "shape") return clip.border ? { ...clip, border: { ...clip.border, color } } : clip;
    if (clip.chart) return { ...clip, chart: { ...clip.chart, colours: [...brand.colors], textColour: readableColour(brand.colors, project.settings.background, 0) } };
    if (clip.table) return { ...clip, table: { ...clip.table, headerColour: color, headerTextColour: readableColour(brand.colors, color, 0), textColour: readableColour(brand.colors, clip.table.cellColour, 0), cellStyles: clip.table.cellStyles ? Object.fromEntries(Object.entries(clip.table.cellStyles).map(([key, style]) => {
      const fill = style.fill ? color : undefined, row = Number(key.split(":")[0]), column = Number(key.split(":")[1]), stripeIndex = clip.table!.stripeAxis === "column" ? column : row, stripeHeader = clip.table!.stripeAxis === "column" ? clip.table!.headerColumn : clip.table!.header, background = fill ?? (clip.table!.header && row === 0 || clip.table!.headerColumn && column === 0 ? color : clip.table!.stripeColour && stripeIndex % 2 === (stripeHeader ? 0 : 1) ? clip.table!.stripeColour : clip.table!.cellColour);
      return [key, { ...style, ...(fill ? { fill } : {}), ...(style.colour || fill ? { colour: readableColour(brand.colors, background, 0) } : {}) }];
    })) : undefined } };
    if (clip.qr) {
      const candidates = brand.colors.filter(value => contrast(value, clip.qr!.background) >= 4.5);
      const foreground = (candidates.length ? candidates : ["#000000", "#ffffff"]).sort((a, b) => contrast(b, clip.qr!.background) - contrast(a, clip.qr!.background))[0];
      return { ...clip, qr: { ...clip.qr, foreground } };
    }
    const gradient = clip.gradient && brand.colors.length > 1 ? { ...clip.gradient, stops: brand.colors.map((colour, index) => ({ colour, offset: index / (brand.colors.length - 1) })) } : null;
    return { ...clip, ...(clip.fill ? { fill: color } : {}), gradient, ...(clip.stroke ? { stroke: { ...clip.stroke, color } } : {}) };
  });
  return clips.some((clip, index) => clip !== project.clips[index]) ? { ...project, clips } : project;
}
