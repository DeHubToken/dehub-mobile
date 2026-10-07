import type { MediaClip, Track } from "./types";

export const AUDIO_TOOL_MODES = ["normalize", "denoise", "voice"] as const;
export type AudioToolMode = typeof AUDIO_TOOL_MODES[number];
export function audioToolCommand(prompt: string, value: unknown): { op: string; id: string; mode: AudioToolMode } | null {
  if (!value || typeof value !== "object") return null;
  const text = prompt.trim().toLowerCase().replace(/[.!]$/, "");
  const tail = "(?: (?:of|in|on|from) (?:(?:this|the|my|selected) )?(?:clip|video|audio))?";
  const mode: AudioToolMode | undefined = new RegExp("^(?:please )?normalize(?: the)? (?:volume|audio)" + tail + "$", "i").test(text) ? "normalize"
    : new RegExp("^(?:please )?(?:reduce|remove)(?: the)? (?:background )?noise" + tail + "$", "i").test(text) ? "denoise"
    : new RegExp("^(?:please )?(?:enhance|clean up)(?: the)? (?:voice|speech)" + tail + "$", "i").test(text) ? "voice" : undefined;
  if (!mode) return null;
  const scene = value as { layers?: unknown; selected?: unknown };
  const layers: { id: string; locked?: boolean; duration?: number }[] = Array.isArray(scene.layers) ? scene.layers.filter(c => c && typeof c.id === "string" && (c.kind === "audio" || c.kind === "video")) : [];
  const selection = Array.isArray(scene.selected) ? scene.selected : [];
  const selected = layers.filter(c => selection.includes(c.id));
  const target = selected.length === 1 ? selected[0] : !selected.length && layers.length === 1 ? layers[0] : undefined;
  return target && !target.locked && !(target.duration && target.duration > 600) ? { op: "process_audio", id: target.id, mode } : null;
}
export interface AudioToolResult { wav: ArrayBuffer; before: { rms: number; peak: number }; after: { rms: number; peak: number }; gain: number }
export function audioToolRange(clip: MediaClip, sourceDuration: number) {
  const speed = clip.speed ?? 1;
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4 || !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.duration > 600 || !Number.isFinite(clip.trimIn) || clip.trimIn < 0 || clip.trimIn >= sourceDuration) throw new Error("range");
  return { speed, duration: clip.duration, offset: clip.trimIn, sourceSeconds: Math.min(clip.duration * speed, sourceDuration - clip.trimIn) };
}

/** Replace a sound, or extract the processed soundtrack without altering the picture. */
export function audioToolLayers(clip: MediaClip, mediaId: string, newId: () => string, sourceTrack?: Track): { clip: MediaClip; added?: MediaClip; track?: Track } {
  if (clip.locked || (clip.kind !== "audio" && clip.kind !== "video")) throw new Error("locked or inaudible");
  const processed: MediaClip = { id: clip.kind === "audio" ? clip.id : newId(), trackId: clip.trackId, kind: "audio", start: clip.start, duration: clip.duration, trimIn: 0, mediaId, sourceDuration: clip.duration, speed: 1, audio: { ...clip.audio, volume: 1 }, hidden: clip.hidden };
  if (clip.kind === "audio") return { clip: { ...clip, ...processed } };
  const track: Track = { id: newId(), kind: "audio", name: "Processed sound", muted: sourceTrack?.muted ?? false, hidden: sourceTrack?.hidden ?? false };
  return { clip: { ...clip, audio: { ...clip.audio, volume: 0 } }, added: { ...processed, trackId: track.id }, track };
}

