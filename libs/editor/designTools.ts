import { literalTextReplacementPlan } from "./designTextMatching";
import { captureChartStyle, type PortableChartStyle } from "./chartStyleFile";
import { captureTableStyle, type PortableTableStyle } from "./tableStyleFile";
import { validDataVisuals } from "./dataVisuals";
import { mapTableCellColours } from "./tableCellStyles";
import { findLiteralTextIndex, replaceLiteralText } from "./designTextMatching";
import type { Clip, ClipEffects, ClipShadow, ProjectSnapshot, ShapeClip, TextClip } from "./types";

/** Formatting clipboard deliberately excludes content, timing, placement and media identity. */
export interface DesignStyle {
  kind: Clip["kind"];
  opacity: number;
  blend: Clip["blend"];
  shadow: ClipShadow | null;
  text?: Partial<TextClip>;
  shape?: Pick<ShapeClip, "fill" | "fillOpacity" | "stroke" | "radius" | "pathSmoothing" | "strokeCap" | "strokeJoin">;
  effects?: ClipEffects;
  radius?: number;
  chartStyle?: PortableChartStyle;
  tableStyle?: PortableTableStyle;
  gradient?: import("./gradientFill").GradientFill | null;
  frame?: import("./types").MediaClip["frame"];
  qrStyle?: Pick<import("./qrGraphic").QrGraphic, "foreground" | "background" | "quietZone">;
  border?: import("./types").TextStroke | null;
}

export function copyDesignStyle(clip: Clip): DesignStyle | null {
  if (clip.kind === "audio") return null;
  const style: DesignStyle = {
    kind: clip.kind, opacity: clip.transform?.opacity ?? 1,
    blend: clip.blend ?? "normal", shadow: clip.shadow ? { ...clip.shadow } : null,
  };
  if (clip.kind === "text") {
    style.gradient = clip.gradient ? { ...clip.gradient, stops: clip.gradient.stops.map(stop => ({ ...stop })) } : null;
    const { fontFamily, fontSize, fontWeight, color, align, italic, uppercase, underline, letterSpacing, lineHeight } = clip;
    style.text = { balance: !!clip.balance, direction: clip.direction ?? "auto", fillOpacity: clip.fillOpacity ?? 1, fontFamily, fontSize, fontWeight, color, align, italic: !!italic, uppercase: !!uppercase,
      echo: clip.echo?.map(layer => ({ ...layer })), curve: clip.curve ?? 0, hollow: !!clip.hollow, strikethrough: !!clip.strikethrough, list: clip.list ?? "none", listStyle: clip.listStyle ? { ...clip.listStyle } : undefined,
      underline: !!underline, paragraphSpacing: clip.paragraphSpacing ?? 0, letterSpacing: letterSpacing ?? 0, lineHeight: lineHeight ?? 1.2,
      background: clip.background ? { ...clip.background } : null, stroke: clip.stroke ? { ...clip.stroke } : null };
  } else if (clip.kind === "shape") {
    style.gradient = clip.gradient ? { ...clip.gradient, stops: clip.gradient.stops.map(stop => ({ ...stop })) } : null;
    style.shape = { fillOpacity: clip.fillOpacity ?? 1, fill: clip.fill, stroke: clip.stroke ? { ...clip.stroke } : null, radius: clip.radius ?? 0, pathSmoothing: clip.pathSmoothing, strokeCap: clip.strokeCap, strokeJoin: clip.strokeJoin };
    if (clip.chart) { try { style.chartStyle = captureChartStyle(clip.chart); } catch { return null; } }
    if (clip.table) { try { style.tableStyle = captureTableStyle(clip.table); } catch { return null; } }
    if (clip.qr) style.qrStyle = { foreground: clip.qr.foreground, background: clip.qr.background, quietZone: clip.qr.quietZone };
  } else {
    style.frame = clip.frame ?? "rect";
    style.border = clip.border ? { ...clip.border, dash: clip.border.dash ? [...clip.border.dash] : undefined } : null;
    style.effects = { ...clip.effects, ...(clip.effects?.duotone ? { duotone: { ...clip.effects.duotone } } : {}) };
    style.radius = clip.radius ?? 0;
  }
  return style;
}

export function pasteDesignStyle(clip: Clip, style: DesignStyle): Clip {
  if (clip.locked || clip.kind === "audio") return clip;
  const common = { ...clip, blend: style.blend, shadow: style.shadow ? { ...style.shadow } : null,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...clip.transform, opacity: style.opacity } };
  if (clip.kind === "text" && style.text) return { ...common, ...style.text, gradient: style.gradient } as TextClip;
  if (clip.kind === "shape" && style.shape) {
    let chart = clip.chart, table = clip.table;
    if (chart && style.chartStyle) {
      try {
        const appearance = captureChartStyle({ ...chart, ...style.chartStyle });
        let next = { ...chart, ...appearance, colours: [...appearance.colours] };
        if (!validDataVisuals({ chart: next }) && next.kind === "pictogram") next = { ...next, pictogramCount: chart.pictogramCount, pictogramMode: chart.pictogramMode };
        if (validDataVisuals({ chart: next })) chart = next;
      } catch { /* Preserve graphic data when a stored style is incompatible. */ }
    }
    if (table && style.tableStyle) {
      try { const next = { ...table, ...captureTableStyle({ ...table, ...style.tableStyle }) }; if (validDataVisuals({ table: next })) table = next; }
      catch { /* Preserve cell structure when a stored style is incompatible. */ }
    }
    return { ...common, ...style.shape, gradient: style.gradient, ...(chart ? { chart } : {}), ...(table ? { table } : {}), ...(clip.qr && style.qrStyle ? { qr: { ...clip.qr, ...style.qrStyle } } : {}) } as ShapeClip;
  }
  if ((clip.kind === "image" || clip.kind === "video") && style.effects) {
    return { ...common, effects: { ...style.effects }, radius: style.radius, frame: style.frame, border: style.border } as Clip;
  }
  return common as Clip;
}

export function applyDesignStyle(project: ProjectSnapshot, ids: readonly string[], style: DesignStyle): ProjectSnapshot {
  const selected = new Set(ids);
  return { ...project, clips: project.clips.map(clip => selected.has(clip.id) ? pasteDesignStyle(clip, style) : clip) };
}

function colourKey(value: string): string {
  const hex = value.trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(hex) ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
}

export function designColours(project: ProjectSnapshot): string[] {
  const colours = new Set<string>();
  const add = (value: string | null | undefined) => { if (value && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) colours.add(colourKey(value)); };
  add(project.settings.background);
  for (const clip of project.clips) {
    if ((clip.kind === "text" || clip.kind === "shape") && clip.gradient) clip.gradient.stops.forEach(stop => add(stop.colour));
    if (clip.kind === "image" || clip.kind === "video") { add(clip.border?.color); add(clip.effects?.duotone?.dark); add(clip.effects?.duotone?.light); }
    if (clip.kind === "text") { add(clip.color); clip.echo?.forEach(layer => add(layer.colour)); add(clip.background?.color); add(clip.stroke?.color); }
    if (clip.kind === "shape") {
      add(clip.fill); add(clip.stroke?.color);
      if (clip.chart) { clip.chart.colours.forEach(add); add(clip.chart.textColour); }
      if (clip.qr) { add(clip.qr.foreground); add(clip.qr.background); }
      if (clip.table) { add(clip.table.headerColour); add(clip.table.headerTextColour); add(clip.table.cellColour); add(clip.table.textColour); add(clip.table.borderColour); if (clip.table.stripeColour) add(clip.table.stripeColour); Object.values(clip.table.cellStyles ?? {}).forEach(style => { add(style.fill); add(style.colour); }); }
    }
    add(clip.shadow?.color);
  }
  return [...colours];
}

/** Replace literal design colours without recolouring photographs or changing locked layers. */
export function replaceDesignColour(project: ProjectSnapshot, from: string, to: string): ProjectSnapshot {
  if (!/^#[0-9a-f]{6}$/i.test(to) || colourKey(from) === colourKey(to)) return project;
  const replace = (value: string) => colourKey(value) === colourKey(from) ? to : value;
  return { ...project, settings: { ...project.settings, background: replace(project.settings.background) },
    clips: project.clips.map(clip => {
      if (clip.locked) return clip;
      const next = { ...clip };
      if ((next.kind === "image" || next.kind === "video") && next.effects?.duotone) next.effects = { ...next.effects, duotone: { ...next.effects.duotone, dark: replace(next.effects.duotone.dark), light: replace(next.effects.duotone.light) } };
      if ((next.kind === "image" || next.kind === "video") && next.border) next.border = { ...next.border, color: replace(next.border.color) };
      if ((next.kind === "text" || next.kind === "shape") && next.gradient) next.gradient = { ...next.gradient, stops: next.gradient.stops.map(stop => ({ ...stop, colour: replace(stop.colour) })) };
      if (next.shadow) next.shadow = { ...next.shadow, color: replace(next.shadow.color) };
      if (next.kind === "text") {
        next.color = replace(next.color); if (next.echo) next.echo = next.echo.map(layer => ({ ...layer, colour: replace(layer.colour) }));
        if (next.background) next.background = { ...next.background, color: replace(next.background.color) };
      }
      if (next.kind === "shape" && next.fill) next.fill = replace(next.fill);
      if (next.kind === "shape" && next.chart) next.chart = { ...next.chart, colours: next.chart.colours.map(replace), textColour: replace(next.chart.textColour) };
      if (next.kind === "shape" && next.qr) next.qr = { ...next.qr, foreground: replace(next.qr.foreground), background: replace(next.qr.background) };
      if (next.kind === "shape" && next.table) next.table = { ...next.table, headerColour: replace(next.table.headerColour), headerTextColour: replace(next.table.headerTextColour), cellColour: replace(next.table.cellColour), textColour: replace(next.table.textColour), borderColour: replace(next.table.borderColour), stripeColour: next.table.stripeColour ? replace(next.table.stripeColour) : next.table.stripeColour, cellStyles: mapTableCellColours(next.table.cellStyles, replace) };
      if ((next.kind === "text" || next.kind === "shape") && next.stroke) next.stroke = { ...next.stroke, color: replace(next.stroke.color) };
      return next;
    }) };
}

export const DESIGN_SIZES = [
  { id: "square", label: "Square post", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait post", width: 1080, height: 1350 },
  { id: "story", label: "Story / Reel", width: 1080, height: 1920 },
  { id: "presentation", label: "Presentation", width: 1920, height: 1080 },
  { id: "thumbnail", label: "Video thumbnail", width: 1280, height: 720 },
  { id: "banner", label: "Profile banner", width: 1500, height: 500 },
  { id: "a4", label: "A4 document", width: 2480, height: 3508 },
  { id: "poster", label: "Poster", width: 2400, height: 3600 },
] as const;

/** All existing text/shape measurements are relative to the page, so resizing preserves composition. */
export function resizeDesign(project: ProjectSnapshot, width: number, height: number): ProjectSnapshot {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64 || width > 8192 || height > 8192) return project;
  const ratio = width / height;
  const aspectPreset = ratio === 1 ? "1:1" : Math.abs(ratio - 16 / 9) < 0.001 ? "16:9"
    : Math.abs(ratio - 9 / 16) < 0.001 ? "9:16" : Math.abs(ratio - 4 / 5) < 0.001 ? "4:5" : "custom";
  return { ...project, settings: { ...project.settings, width: Math.round(width), height: Math.round(height), aspectPreset } };
}

export function findDesignText(project: ProjectSnapshot, query: string, matchCase = false, wholeWords = false): TextClip[] {
  if (!query) return [];
  return project.clips.filter((clip): clip is TextClip => clip.kind === "text" && findLiteralTextIndex(clip.text, query, matchCase, wholeWords) >= 0);
}

/** Replacement text is literal, including characters such as $ and backslashes. */
export function replaceDesignText(project: ProjectSnapshot, query: string, replacement: string, matchCase = false, ids?: readonly string[], wholeWords = false): ProjectSnapshot {
  if (!query) return project;
  const selected = ids ? new Set(ids) : null;
  let changed = false;
  const clips = project.clips.map(clip => {
    if (clip.kind !== "text" || clip.locked || (selected && !selected.has(clip.id))) return clip;
    const plan = literalTextReplacementPlan(clip.text, query, replacement, matchCase, wholeWords);
    if (plan.outputLength > 100000) throw new Error("Shorten the replacement to keep each text layer within 100,000 characters");
    const text = replaceLiteralText(clip.text, query, replacement, matchCase, wholeWords);
    if (text === clip.text) return clip;
    changed = true; return { ...clip, text, pageNumber: undefined };
  });
  return changed ? { ...project, clips } : project;
}

export function replaceFirstDesignText(project: ProjectSnapshot, id: string, query: string, replacement: string, matchCase = false, wholeWords = false): ProjectSnapshot {
  const clip = project.clips.find(clip => clip.id === id);
  if (!query || !clip || clip.kind !== "text" || clip.locked) return project;
  const plan = literalTextReplacementPlan(clip.text, query, replacement, matchCase, wholeWords);
  if (!plan.count) return project;
  if (clip.text.length - plan.firstLength + replacement.length > 100000) throw new Error("Shorten the replacement to keep the text layer within 100,000 characters");
  const text = clip.text.slice(0, plan.firstIndex) + replacement + clip.text.slice(plan.firstIndex + plan.firstLength);
  if (text === clip.text) return project;
  return { ...project, clips: project.clips.map(value => value.id === id ? { ...clip, text, pageNumber: undefined } : value) };
}

export const DESIGN_PALETTES = [
  { id: "ink", label: "Ink", colours: ["#faf9f6", "#202020", "#67645e", "#c9c3b8", "#9e775a"] },
  { id: "ocean", label: "Ocean", colours: ["#ecfeff", "#083344", "#0891b2", "#67e8f9", "#155e75"] },
  { id: "citrus", label: "Citrus", colours: ["#fffbea", "#302d17", "#f59e0b", "#facc15", "#65a30d"] },
  { id: "rose", label: "Rose", colours: ["#fff1f2", "#4c0519", "#e11d48", "#fda4af", "#9f1239"] },
  { id: "forest", label: "Forest", colours: ["#f0fdf4", "#052e16", "#16a34a", "#86efac", "#166534"] },
  { id: "midnight", label: "Midnight", colours: ["#0f172a", "#f8fafc", "#38bdf8", "#818cf8", "#cbd5e1"] },
] as const;

/** Simultaneous mapping prevents one replacement colour being replaced again. */
export function applyDesignPalette(project: ProjectSnapshot, colours: readonly string[]): ProjectSnapshot {
  if (!colours.length || colours.some(c => !/^#[0-9a-f]{6}$/i.test(c))) return project;
  const originals = designColours(project);
  const mapping = new Map<string, string>(originals.map((colour, index) => [colour, colours[index % colours.length]]));
  const recolour = (value: string) => mapping.get(colourKey(value)) ?? value;
  return { ...project, settings: { ...project.settings, background: recolour(project.settings.background) }, clips: project.clips.map(clip => {
    if (clip.locked) return clip;
    const next = { ...clip };
    if ((next.kind === "image" || next.kind === "video") && next.effects?.duotone) next.effects = { ...next.effects, duotone: { ...next.effects.duotone, dark: recolour(next.effects.duotone.dark), light: recolour(next.effects.duotone.light) } };
    if ((next.kind === "image" || next.kind === "video") && next.border) next.border = { ...next.border, color: recolour(next.border.color) };
    if ((next.kind === "text" || next.kind === "shape") && next.gradient) next.gradient = { ...next.gradient, stops: next.gradient.stops.map(stop => ({ ...stop, colour: recolour(stop.colour) })) };
    if (next.shadow) next.shadow = { ...next.shadow, color: recolour(next.shadow.color) };
    if (next.kind === "text") {
      next.color = recolour(next.color); if (next.echo) next.echo = next.echo.map(layer => ({ ...layer, colour: recolour(layer.colour) }));
      if (next.background) next.background = { ...next.background, color: recolour(next.background.color) };
    }
    if (next.kind === "shape" && next.fill) next.fill = recolour(next.fill);
    if (next.kind === "shape" && next.chart) next.chart = { ...next.chart, colours: next.chart.colours.map(recolour), textColour: recolour(next.chart.textColour) };
    if (next.kind === "shape" && next.qr) next.qr = { ...next.qr, foreground: recolour(next.qr.foreground), background: recolour(next.qr.background) };
    if (next.kind === "shape" && next.table) next.table = { ...next.table, headerColour: recolour(next.table.headerColour), headerTextColour: recolour(next.table.headerTextColour), cellColour: recolour(next.table.cellColour), textColour: recolour(next.table.textColour), borderColour: recolour(next.table.borderColour), stripeColour: next.table.stripeColour ? recolour(next.table.stripeColour) : next.table.stripeColour, cellStyles: mapTableCellColours(next.table.cellStyles, recolour) };
    if ((next.kind === "text" || next.kind === "shape") && next.stroke) next.stroke = { ...next.stroke, color: recolour(next.stroke.color) };
    return next;
  }) };
}
