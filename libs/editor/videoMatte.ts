import type { Clip, MediaClip } from "./types";
export const VIDEO_MATTE_ASSET_PREFIX = ".dehub-video-matte-";
export interface VideoMattePlan {
  sourceMediaId: string;
  start: number;
  end: number;
  fps: number;
  frames: number;
  width: number;
  height: number;
  columns: number;
  atlasWidth: number;
  atlasHeight: number;
  model: string;
}
/** Saved source-clock alpha frames. The original video and its audio stay intact. */
export interface VideoMatte extends VideoMattePlan { mediaId: string }
export interface VideoMatteProgress {
  stage: "download" | "frames" | "fallback";
  fraction: number;
  completed: number;
  total: number;
}

export function videoMattePlan(clip: MediaClip, width: number, height: number, sourceDuration: number, fps: number): VideoMattePlan {
  var speed = clip.speed == null ? 1 : clip.speed;
  var start = clip.trimIn, end = start + clip.duration * speed;
  if (clip.kind !== "video" || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start || !Number.isFinite(sourceDuration) || end > sourceDuration + 0.002 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error("Invalid video range for background removal");
  var frames = Math.ceil((end - start) * fps - 1e-8);
  if (frames < 1) throw new Error("Video range is too short for background removal");
  if (frames > 600) throw new Error("Trim this clip to " + (600 / fps).toFixed(1) + " source seconds before removing its background");
  var scale = Math.min(1, 512 / Math.max(width, height));
  var w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
  var columns = Math.min(frames, Math.max(1, Math.ceil(Math.sqrt(frames * h / w))));
  var rows = Math.ceil(frames / columns);
  var shrink = Math.min(1, 4096 / (w * columns), 4096 / (h * rows), Math.sqrt(16777216 / (w * h * columns * rows)));
  w = Math.max(1, Math.floor(w * shrink)); h = Math.max(1, Math.floor(h * shrink));
  return { sourceMediaId: clip.mediaId, start: start, end: end, fps: fps, frames: frames, width: w, height: h, columns: columns, atlasWidth: w * columns, atlasHeight: h * rows, model: "birefnet-lite-512:4a3c40c" };
}
export function validVideoMatte(clip: MediaClip): boolean {
  var m = clip.videoMatte;
  return !!m && m.sourceMediaId === clip.mediaId && typeof m.mediaId === "string" && m.mediaId.length > 0 && Number.isFinite(m.start) && m.start >= 0 && Number.isFinite(m.end) && m.end > m.start && Number.isFinite(m.fps) && m.fps >= 1 && m.fps <= 120 && Number.isInteger(m.frames) && m.frames > 0 && m.frames <= 600 && m.frames === Math.ceil((m.end - m.start) * m.fps - 1e-8) && Number.isInteger(m.width) && m.width > 0 && m.width <= 512 && Number.isInteger(m.height) && m.height > 0 && m.height <= 512 && Number.isInteger(m.columns) && m.columns > 0 && m.columns <= m.frames && m.atlasWidth === m.width * m.columns && m.atlasHeight === m.height * Math.ceil(m.frames / m.columns) && m.atlasWidth <= 4096 && m.atlasHeight <= 4096 && m.atlasWidth * m.atlasHeight <= 16777216;
}
export function videoMatteFrame(clip: MediaClip, sourceTime: number): { x: number; y: number; width: number; height: number; index: number } | null {
  if (!validVideoMatte(clip) || !Number.isFinite(sourceTime)) return null;
  var m = clip.videoMatte!;
  if (sourceTime < m.start - 1e-6 || sourceTime >= m.end + 1e-6) return null;
  var index = Math.min(m.frames - 1, Math.max(0, Math.floor((sourceTime - m.start) * m.fps + 1e-7)));
  return { x: (index % m.columns) * m.width, y: Math.floor(index / m.columns) * m.height, width: m.width, height: m.height, index: index };
}
export function assertVideoMattes(clips: Clip[], available: (id: string, width: number, height: number) => boolean): void {
  for (var clip of clips) {
    if (clip.kind !== "video" || !clip.videoMatte) continue;
    var end = clip.trimIn + clip.duration * (clip.speed == null ? 1 : clip.speed);
    if (!validVideoMatte(clip) || clip.trimIn < clip.videoMatte.start - 1e-6 || end > clip.videoMatte.end + 1e-6 || !available(clip.videoMatte.mediaId, clip.videoMatte.atlasWidth, clip.videoMatte.atlasHeight)) throw new Error("Background-removal frames are missing for this range. Restore the background or remove it again before exporting.");
  }
}

/** Exact, unambiguous cut-out requests avoid a text-planning round trip. */
export function videoMatteCommand(prompt: string, scene: unknown): { op: "remove_background"; id: string } | null {
  const text = prompt.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!/^(?:please\s+)?remove\s+(?:the\s+)?(?:video\s+)?background(?:\s+(?:from|of)\s+(?:(?:the|this|my)\s+)?(?:video|clip))?$/.test(text) || !scene || typeof scene !== "object") return null;
  const value = scene as { selected?: string[]; layers?: { id: string; kind: string; locked?: boolean; hidden?: boolean }[] };
  const layers = (value.layers ?? []).filter(c => !c.hidden), videos = layers.filter(c => c.kind === "video");
  const selected = videos.filter(c => value.selected?.includes(c.id));
  const explicit = /\b(?:video|clip)\b/.test(text);
  const clip = selected.length === 1 && value.selected?.length === 1 ? selected[0] : !value.selected?.length && videos.length === 1 && (explicit || layers.filter(c => c.kind !== "audio").length === 1) ? videos[0] : undefined;
  return clip && !clip.locked ? { op: "remove_background", id: clip.id } : null;
}
