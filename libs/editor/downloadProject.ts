import type { ProjectSnapshot } from "./types";

export interface VideoDownloadRequest { url: string; title?: string; username?: string | null }
export function downloadProject(mediaId: string, info: { duration?: number; width?: number; height?: number }, title = "video", contentDuration = info.duration): ProjectSnapshot {
  const { width = 0, height = 0, duration = 0 } = info;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(contentDuration) || !contentDuration || contentDuration <= 0 || contentDuration > duration
    || !Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) throw new Error("Invalid video metadata");
  return {
    id: "download-" + mediaId, title, updatedAt: Date.now(),
    settings: { width: Math.round(width) & ~1, height: Math.round(height) & ~1, fps: 30, background: "#000000", aspectPreset: "custom" },
    tracks: [{ id: "download-video", name: "Video", kind: "video", muted: false, hidden: false }],
    clips: [{ id: "download-clip", trackId: "download-video", kind: "video", mediaId, start: 0, trimIn: 0, duration: contentDuration, sourceDuration: duration, speed: 1, fit: "contain" }],
  };
}
