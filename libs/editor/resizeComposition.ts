import { scaleStrokePaint } from "./strokePatterns";
import { getDesignGuides } from "./designGuides";
import type { Clip, ClipKeyframes, ProjectSnapshot } from "./types";
export type ResizeContentMode = "relative" | "fit" | "fill";
export type ResizeAnchor = { x: number; y: number };
export const RESIZE_ANCHORS = [
  { id: "top-left", x: 0, y: 0 }, { id: "top", x: 0.5, y: 0 }, { id: "top-right", x: 1, y: 0 },
  { id: "left", x: 0, y: 0.5 }, { id: "centre", x: 0.5, y: 0.5 }, { id: "right", x: 1, y: 0.5 },
  { id: "bottom-left", x: 0, y: 1 }, { id: "bottom", x: 0.5, y: 1 }, { id: "bottom-right", x: 1, y: 1 },
] as const;

/** Fit the full composition uniformly while retaining editable layers and motion paths. */
export function resizeComposition(before: ProjectSnapshot, resized: ProjectSnapshot, mode: ResizeContentMode, anchor: ResizeAnchor, sources: ReadonlyMap<string, { width: number; height: number }> = new Map()): ProjectSnapshot {
  if (mode === "relative" || before.settings.width === resized.settings.width && before.settings.height === resized.settings.height) return resized;
  if (!["fit", "fill"].includes(mode) || ![anchor.x, anchor.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("Choose how the artwork should fit the new page");
  const W = resized.settings.width, H = resized.settings.height, oldW = before.settings.width, oldH = before.settings.height;
  const factor = (mode === "fit" ? Math.min : Math.max)(W / oldW, H / oldH), kx = oldW * factor / W, ky = oldH * factor / H;
  const ox = (1 - kx) * anchor.x, oy = (1 - ky) * anchor.y;
  const x = (value: number) => value * kx + ox, y = (value: number) => value * ky + oy;
  const safe = (value: number, minimum: number, maximum: number, label: string) => {
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`This page size would exceed the supported ${label} range. Choose a closer size or scale layers first`);
    return value;
  };
  const clips = before.clips.map<Clip>(clip => {
    if (clip.kind === "audio" || clip.isPageBackground) return clip;
    const next = { ...clip }, transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...clip.transform };
    let scaleFactor = 1;
    if (clip.kind === "image" || clip.kind === "video") {
      const size = sources.get(clip.mediaId);
      if (!size || ![size.width, size.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("Wait for every photo and video to load before fitting artwork to a new page");
      const edge = (value: number | undefined) => Math.max(0, Math.min(0.9, value ?? 0));
      const left = edge(clip.crop?.left), top = edge(clip.crop?.top), right = Math.min(edge(clip.crop?.right), 0.95 - left), bottom = Math.min(edge(clip.crop?.bottom), 0.95 - top);
      const sw = size.width * (1 - left - right), sh = size.height * (1 - top - bottom), fit = clip.fit === "cover" ? Math.max : Math.min;
      scaleFactor = fit(oldW / sw, oldH / sh) * factor / fit(W / sw, H / sh);
      transform.scale = safe(transform.scale * scaleFactor, 0.05, 20, "layer scale");
    }
    transform.x = safe(x(transform.x), -20, 20, "horizontal position"); transform.y = safe(y(transform.y), -20, 20, "vertical position");
    next.transform = transform;
    if (clip.keyframes) {
      const keys: ClipKeyframes = { ...clip.keyframes };
      if (keys.x) keys.x = keys.x.map(key => ({ ...key, v: safe(x(key.v), -20, 20, "motion position") }));
      if (keys.y) keys.y = keys.y.map(key => ({ ...key, v: safe(y(key.v), -20, 20, "motion position") }));
      if (keys.scale && scaleFactor !== 1) keys.scale = keys.scale.map(key => ({ ...key, v: safe(key.v * scaleFactor, 0.05, 20, "motion scale") }));
      next.keyframes = keys;
    }
    if (next.shadow) next.shadow = { ...next.shadow, blur: next.shadow.blur * ky, offsetX: next.shadow.offsetX * ky, offsetY: next.shadow.offsetY * ky };
    if (next.kind === "text" && clip.kind === "text") {
      next.x = x(clip.x); next.y = y(clip.y); next.fontSize = safe(clip.fontSize * ky, 6, 1000, "font size");
      if (clip.maxWidth !== undefined) next.maxWidth = safe(clip.maxWidth * kx, 0.0001, 1, "text width");
      if (clip.maxHeight !== undefined) next.maxHeight = safe(clip.maxHeight * ky, 0.0001, 1, "text height");
      if (clip.paragraphSpacing !== undefined) next.paragraphSpacing = safe(clip.paragraphSpacing * ky, 0, 300, "paragraph spacing");
      if (clip.letterSpacing !== undefined) next.letterSpacing = clip.letterSpacing * ky;
      if (clip.stroke) next.stroke = scaleStrokePaint(clip.stroke, ky);
      if (clip.background) next.background = { ...clip.background, padding: clip.background.padding * ky, radius: clip.background.radius * ky };
      if (clip.echo) next.echo = clip.echo.map(layer => ({ ...layer, x: safe(layer.x * ky, -100, 100, "text echo"), y: safe(layer.y * ky, -100, 100, "text echo") }));
    } else if (next.kind === "shape" && clip.kind === "shape") {
      next.w = safe(clip.w * kx, 0.0001, 20, "shape width"); next.h = safe(clip.h * ky, 0.0001, 20, "shape height");
      if (clip.radius !== undefined) next.radius = clip.radius * ky;
      if (clip.stroke) next.stroke = scaleStrokePaint(clip.stroke, ky);
    } else if ((next.kind === "image" || next.kind === "video") && (clip.kind === "image" || clip.kind === "video")) {
      if (clip.radius !== undefined) next.radius = clip.radius * ky;
      if (clip.border) next.border = scaleStrokePaint(clip.border, ky);
    }
    return next;
  });
  const guides = getDesignGuides(before.settings.guides), positions = (values: number[], map: (value: number) => number) => values.map(map).filter(value => value >= 0 && value <= 1);
  return { ...resized, clips, settings: { ...resized.settings, ...(before.settings.guides ? { guides: { ...guides, vertical: positions(guides.vertical, x), horizontal: positions(guides.horizontal, y) } } : {}) } };
}
