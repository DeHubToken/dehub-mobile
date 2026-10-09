import type { Clip, MediaClip } from "./types";
export const VIDEO_MATTE_ASSET_PREFIX = ".dehub-video-matte-";
export const VIDEO_MATTE_MAX_SOURCE_SECONDS = 600;
export interface VideoMatteAtlas { columns: number; atlasWidth: number; atlasHeight: number }
export interface VideoMattePagePlan extends VideoMatteAtlas { firstFrame: number; frames: number }
export interface VideoMattePage extends VideoMattePagePlan { mediaId: string }
export interface VideoMattePlan extends VideoMatteAtlas {
  sourceMediaId: string; start: number; end: number; fps: number; frames: number; width: number; height: number; model: string;
}
/** Source-clock alpha pages retain the original video and audio. Legacy atlases remain readable. */
export interface VideoMatte extends VideoMattePlan { mediaId: string; pages?: VideoMattePage[] }
export interface VideoMatteProgress { stage: "download" | "frames" | "fallback"; fraction: number; completed: number; total: number }
export interface VideoMattePageOutput extends VideoMattePagePlan { dataUrl: string }
export type VideoMattePageSink = (page: VideoMattePageOutput, plan: VideoMattePlan, pageIndex: number) => Promise<string>;
export type VideoMatteResult = { plan: VideoMattePlan; dataUrl: string; matte?: undefined } | { plan: VideoMattePlan; matte: VideoMatte; dataUrl?: undefined };

export function videoMattePlan(clip: MediaClip, width: number, height: number, sourceDuration: number, fps: number): VideoMattePlan {
  var speed = clip.speed == null ? 1 : clip.speed;
  var start = clip.trimIn, end = start + clip.duration * speed;
  if (clip.kind !== "video" || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start || !Number.isFinite(sourceDuration) || end > sourceDuration + 0.002 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error("Invalid video range for background removal");
  var frames = Math.ceil((end - start) * fps - 1e-8);
  if (frames < 1) throw new Error("Video range is too short for background removal");
  if (end - start > 600 + 1e-8 || frames > 72000) throw new Error("Trim this clip to 600 source seconds before removing its background");
  var count = Math.min(600, frames);
  var scale = Math.min(1, 512 / Math.max(width, height));
  var w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
  var columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * h / w))));
  var rows = Math.ceil(count / columns);
  var shrink = Math.min(1, 4096 / (w * columns), 4096 / (h * rows), Math.sqrt(16777216 / (w * h * columns * rows)));
  w = Math.max(1, Math.floor(w * shrink)); h = Math.max(1, Math.floor(h * shrink));
  return { sourceMediaId: clip.mediaId, start: start, end: end, fps: fps, frames: frames, width: w, height: h, columns: columns, atlasWidth: w * columns, atlasHeight: h * rows, model: "birefnet-lite-512:4a3c40c" };
}
export function videoMattePagePlan(plan: VideoMattePlan, pageIndex: number): VideoMattePagePlan {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex * 600 >= plan.frames) throw new Error("Invalid background page");
  var firstFrame = pageIndex * 600, frames = Math.min(600, plan.frames - firstFrame), columns = Math.min(plan.columns, frames);
  return { firstFrame: firstFrame, frames: frames, columns: columns, atlasWidth: columns * plan.width, atlasHeight: Math.ceil(frames / columns) * plan.height };
}
export function validVideoMatte(clip: MediaClip): boolean {
  var m = clip.videoMatte;
  if (!m || m.sourceMediaId !== clip.mediaId || typeof m.mediaId !== "string" || !m.mediaId.length || !Number.isFinite(m.start) || m.start < 0 || !Number.isFinite(m.end) || m.end <= m.start || m.end - m.start > 600 + 1e-8 || !Number.isFinite(m.fps) || m.fps < 1 || m.fps > 120 || !Number.isInteger(m.frames) || m.frames < 1 || m.frames > 72000 || m.frames !== Math.ceil((m.end - m.start) * m.fps - 1e-8) || !Number.isInteger(m.width) || m.width < 1 || m.width > 512 || !Number.isInteger(m.height) || m.height < 1 || m.height > 512 || !Number.isInteger(m.columns) || m.columns < 1 || m.columns > Math.min(m.frames, 600)) return false;
  if (m.pages === undefined) return m.frames <= 600 && m.atlasWidth === m.width * m.columns && m.atlasHeight === m.height * Math.ceil(m.frames / m.columns) && m.atlasWidth <= 4096 && m.atlasHeight <= 4096 && m.atlasWidth * m.atlasHeight <= 16777216;
  if (!Array.isArray(m.pages) || m.pages.length !== Math.ceil(m.frames / 600) || m.pages.length > 120) return false;
  var seen = new Set();
  for (var i = 0; i < m.pages.length; i++) {
    var page = m.pages[i], expected = videoMattePagePlan(m, i);
    if (!page || typeof page.mediaId !== "string" || !page.mediaId.length || seen.has(page.mediaId) || page.firstFrame !== expected.firstFrame || page.frames !== expected.frames || page.columns !== expected.columns || page.atlasWidth !== expected.atlasWidth || page.atlasHeight !== expected.atlasHeight || page.atlasWidth > 4096 || page.atlasHeight > 4096 || page.atlasWidth * page.atlasHeight > 16777216) return false;
    seen.add(page.mediaId);
  }
  return m.mediaId === m.pages[0].mediaId && m.atlasWidth === m.pages[0].atlasWidth && m.atlasHeight === m.pages[0].atlasHeight;
}
export function videoMatteFrame(clip: MediaClip, sourceTime: number): { x: number; y: number; width: number; height: number; index: number; mediaId: string; atlasWidth: number; atlasHeight: number; pageIndex: number } | null {
  if (!validVideoMatte(clip) || !Number.isFinite(sourceTime)) return null;
  var m = clip.videoMatte!;
  if (sourceTime < m.start - 1e-6 || sourceTime >= m.end + 1e-6) return null;
  var index = Math.min(m.frames - 1, Math.max(0, Math.floor((sourceTime - m.start) * m.fps + 1e-7)));
  var pageIndex = Math.floor(index / 600), page = m.pages ? m.pages[pageIndex] : m;
  var localIndex = m.pages ? index - m.pages[pageIndex].firstFrame : index;
  return { x: (localIndex % page.columns) * m.width, y: Math.floor(localIndex / page.columns) * m.height, width: m.width, height: m.height, index: index, mediaId: page.mediaId, atlasWidth: page.atlasWidth, atlasHeight: page.atlasHeight, pageIndex: pageIndex };
}
export function videoMatteMediaIds(matte: VideoMatte | null | undefined): string[] {
  if (!matte) return [];
  var ids = [matte.mediaId];
  if (Array.isArray(matte.pages)) for (var page of matte.pages) if (page && typeof page.mediaId === "string") ids.push(page.mediaId);
  return Array.from(new Set(ids.filter(function(id) { return typeof id === "string" && id.length > 0; })));
}
export function assertVideoMattes(clips: Clip[], available: (id: string, width: number, height: number) => boolean): void {
  for (var clip of clips) {
    if (clip.kind !== "video" || !clip.videoMatte) continue;
    var m = clip.videoMatte, end = clip.trimIn + clip.duration * (clip.speed == null ? 1 : clip.speed);
    if (!validVideoMatte(clip) || clip.trimIn < m.start - 1e-6 || end > m.end + 1e-6) throw new Error("Background-removal frames are missing for this range. Restore the background or remove it again before exporting.");
    var pages = m.pages || [m];
    for (var page of pages) if (!available(page.mediaId, page.atlasWidth, page.atlasHeight)) throw new Error("Background-removal frames are missing for this range. Restore the background or remove it again before exporting.");
  }
}


/** Validate the plan before allocating or persisting any incoming page. */
export function validVideoMattePageOutput(clip: MediaClip, plan: VideoMattePlan, page: VideoMattePageOutput, pageIndex: number): boolean {
  if (!plan || !page || !Number.isInteger(plan.frames) || plan.frames < 1 || plan.frames > 72000 || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= Math.ceil(plan.frames / 600)) return false;
  const pages = Array.from({ length: Math.ceil(plan.frames / 600) }, (_, i) => ({ ...videoMattePagePlan(plan, i), mediaId: `pending-${i}` }));
  if (!validVideoMatte({ ...clip, videoMatte: { ...plan, mediaId: pages[0].mediaId, pages } }) || plan.start !== clip.trimIn || Math.abs(plan.end - (clip.trimIn + clip.duration * (clip.speed ?? 1))) > 1e-6) return false;
  const expected = videoMattePagePlan(plan, pageIndex);
  return page.firstFrame === expected.firstFrame && page.frames === expected.frames && page.columns === expected.columns && page.atlasWidth === expected.atlasWidth && page.atlasHeight === expected.atlasHeight && typeof page.dataUrl === "string" && page.dataUrl.length <= 22 + 4 * Math.ceil(16 * 1024 * 1024 / 3) && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(page.dataUrl);
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
