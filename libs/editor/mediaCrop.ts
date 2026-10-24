import type { ClipCrop, MediaClip } from "./types";

export const CROP_ASPECTS = [
  { label: "Original", ratio: 0 }, { label: "1:1", ratio: 1 }, { label: "4:5", ratio: 4 / 5 },
  { label: "3:2", ratio: 3 / 2 }, { label: "4:3", ratio: 4 / 3 }, { label: "16:9", ratio: 16 / 9 }, { label: "9:16", ratio: 9 / 16 },
] as const;
const bounded = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export function normaliseMediaCrop(crop?: ClipCrop | null): ClipCrop {
  const left = bounded(crop?.left ?? 0, 0, 0.9), top = bounded(crop?.top ?? 0, 0, 0.9);
  return { left, top, right: bounded(crop?.right ?? 0, 0, Math.min(0.9, 0.95 - left)), bottom: bounded(crop?.bottom ?? 0, 0, Math.min(0.9, 0.95 - top)) };
}

export function mediaCropFocus(clip: MediaClip): { x: number; y: number } {
  const crop = normaliseMediaCrop(clip.crop), w = crop.left + crop.right, h = crop.top + crop.bottom;
  const x = w ? crop.left / w : 0.5, y = h ? crop.top / h : 0.5;
  return { x: clip.transform?.flipH ? 1 - x : x, y: clip.transform?.flipV ? 1 - y : y };
}

/** Canvas deltas follow the visible image, including rotation and flips. */
export function panMediaCrop(clip: MediaClip, box: { w: number; h: number; rotation: number }, dx: number, dy: number): Partial<MediaClip> | null {
  if (clip.locked || clip.kind === "audio" || box.w <= 0 || box.h <= 0 || ![dx, dy, box.w, box.h, box.rotation].every(Number.isFinite)) return null;
  const crop = normaliseMediaCrop(clip.crop), horizontal = crop.left + crop.right, vertical = crop.top + crop.bottom;
  const angle = -box.rotation * Math.PI / 180;
  const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) * (clip.transform?.flipH ? -1 : 1);
  const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) * (clip.transform?.flipV ? -1 : 1);
  const left = bounded(crop.left - x / box.w * (1 - horizontal), Math.max(0, horizontal - 0.9), Math.min(0.9, horizontal));
  const top = bounded(crop.top - y / box.h * (1 - vertical), Math.max(0, vertical - 0.9), Math.min(0.9, vertical));
  if (Math.abs(left - crop.left) < 1e-10 && Math.abs(top - crop.top) < 1e-10) return null;
  return { crop: { left, right: horizontal - left, top, bottom: vertical - top } };
}

/** Zoom the source within its frame; the crop aspect and outer footprint stay fixed. */
export function zoomMediaCrop(clip: MediaClip, zoom: number): Partial<MediaClip> | null {
  if (clip.locked || clip.kind === "audio" || !Number.isFinite(zoom) || zoom <= 0) return null;
  const crop = normaliseMediaCrop(clip.crop), width = 1 - crop.left - crop.right, height = 1 - crop.top - crop.bottom;
  const factor = bounded(1 / zoom, Math.max(0.05 / width, 0.05 / height), Math.min(1 / width, 1 / height));
  const afterWidth = width * factor, afterHeight = height * factor;
  const horizontal = 1 - afterWidth, vertical = 1 - afterHeight;
  const left = bounded(crop.left + (width - afterWidth) / 2, Math.max(0, horizontal - 0.9), Math.min(0.9, horizontal));
  const top = bounded(crop.top + (height - afterHeight) / 2, Math.max(0, vertical - 0.9), Math.min(0.9, vertical));
  if (Math.abs(left - crop.left) < 1e-10 && Math.abs(top - crop.top) < 1e-10 && Math.abs(afterWidth - width) < 1e-10 && Math.abs(afterHeight - height) < 1e-10) return null;
  return { crop: { left, right: horizontal - left, top, bottom: vertical - top } };
}

/** Move the crop window inside its source without changing the visible frame's dimensions. */
export function focusMediaCrop(clip: MediaClip, x: number, y: number): Partial<MediaClip> | null {
  if (clip.locked || clip.kind === "audio") return null;
  const crop = normaliseMediaCrop(clip.crop), horizontal = crop.left + crop.right, vertical = crop.top + crop.bottom;
  const left = bounded(horizontal * bounded(clip.transform?.flipH ? 1 - x : x), Math.max(0, horizontal - 0.9), Math.min(0.9, horizontal));
  const top = bounded(vertical * bounded(clip.transform?.flipV ? 1 - y : y), Math.max(0, vertical - 0.9), Math.min(0.9, vertical));
  return { crop: { left, right: horizontal - left, top, bottom: vertical - top } };
}

/** Preserve displayed area and scale keys when an aspect preset changes the crop window. */
export function cropMediaToAspect(clip: MediaClip, page: { width: number; height: number }, source: { width: number; height: number }, ratio: number,
  focalX = 0.5, focalY = 0.5): Partial<MediaClip> | null {
  if (clip.locked || clip.kind === "audio" || ![page.width, page.height, source.width, source.height].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(ratio) || ratio < 0) return null;
  const before = normaliseMediaCrop(clip.crop), sourceAspect = source.width / source.height;
  const horizontal = ratio > 0 && sourceAspect > ratio ? 1 - ratio / sourceAspect : 0;
  const vertical = ratio > 0 && sourceAspect < ratio ? 1 - sourceAspect / ratio : 0;
  if (horizontal > 0.95 || vertical > 0.95) return null;
  const x = bounded(clip.transform?.flipH ? 1 - focalX : focalX), y = bounded(clip.transform?.flipV ? 1 - focalY : focalY);
  const left = bounded(horizontal * x, Math.max(0, horizontal - 0.9), Math.min(0.9, horizontal)), top = bounded(vertical * y, Math.max(0, vertical - 0.9), Math.min(0.9, vertical));
  const crop = { left, right: horizontal - left, top, bottom: vertical - top };
  const beforeW = source.width * (1 - before.left - before.right), beforeH = source.height * (1 - before.top - before.bottom);
  const afterW = source.width * (1 - crop.left - crop.right), afterH = source.height * (1 - crop.top - crop.bottom);
  const fit = (width: number, height: number) => clip.fit === "cover" ? Math.max(page.width / width, page.height / height) : Math.min(page.width / width, page.height / height);
  const factor = Math.sqrt(beforeW * beforeH / (afterW * afterH)) * fit(beforeW, beforeH) / fit(afterW, afterH);
  const scale = bounded((clip.transform?.scale ?? 1) * factor, 0.05, 20);
  const appliedFactor = scale / Math.max(0.05, clip.transform?.scale ?? 1);
  return { crop: ratio ? crop : null, transform: { x: 0.5, y: 0.5, rotation: 0, ...clip.transform, scale },
    ...(clip.keyframes?.scale ? { keyframes: { ...clip.keyframes, scale: clip.keyframes.scale.map(key => ({ ...key, v: bounded(key.v * appliedFactor, 0.05, 20) })) } } : {}) };
}
