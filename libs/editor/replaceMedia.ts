import type { ClipCrop, MediaClip, ProjectSnapshot } from "./types";

export interface ReplacementMedia { id: string; kind: "image" | "video" | "audio"; width?: number; height?: number; duration?: number }

/** Replace the source while retaining the layer's visible aspect, placement, frame and styling. */
export function replaceDesignMedia(project: ProjectSnapshot, id: string, source: ReplacementMedia, previous?: { width?: number; height?: number } | null): ProjectSnapshot {
  const clip = project.clips.find(c => c.id === id);
  if (!clip || clip.locked || (clip.kind !== "image" && clip.kind !== "video" && clip.kind !== "audio") || clip.mediaId === source.id) return project;
  if (clip.kind === "audio" ? source.kind === "image" : source.kind === "audio") return project;
  let crop: ClipCrop | null = null;
  if (clip.kind !== "audio" && previous?.width && previous?.height && source.width && source.height) {
    const old = clip.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const aspect = previous.width * Math.max(0.02, 1 - old.left - old.right) / (previous.height * Math.max(0.02, 1 - old.top - old.bottom));
    const natural = source.width / source.height;
    if (natural > aspect) { const inset = Math.min(0.49, (1 - aspect / natural) / 2); crop = { left: inset, right: inset, top: 0, bottom: 0 }; }
    else { const inset = Math.min(0.49, (1 - natural / aspect) / 2); crop = { left: 0, right: 0, top: inset, bottom: inset }; }
  }
  const kind = clip.kind === "audio" ? "audio" : source.kind as "image" | "video";
  const rate = kind === "image" ? 1 : clip.speed ?? 1;
  const sourceDuration = source.kind === "image" ? undefined : source.duration;
  const duration = sourceDuration && Number.isFinite(sourceDuration) && sourceDuration > 0 ? Math.min(clip.duration, sourceDuration / rate) : clip.duration;
  const next: MediaClip = { ...clip, kind, mediaId: source.id, trimIn: 0, duration, sourceDuration, crop,
    videoMatte: null, beats: undefined, speed: kind === "image" ? undefined : clip.speed,
    audio: kind === "image" ? undefined : clip.audio ? { ...clip.audio, envelope: undefined } : undefined };
  return { ...project, clips: project.clips.map(c => c.id === id ? next : c) };
}
