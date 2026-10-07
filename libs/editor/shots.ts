import type { MediaClip } from "./types";
export interface ShotAnalysis { times: number[]; sampled: number; precision: number }
export function validShotAnalysis(value: unknown, clip: MediaClip): value is ShotAnalysis {
  if (!value || typeof value !== "object") return false;
  const result = value as ShotAnalysis;
  return Array.isArray(result.times) && result.times.length <= 99 && Number.isInteger(result.sampled) && result.sampled > 0 && result.sampled <= 2401 && Number.isFinite(result.precision) && result.precision > 0 && result.precision <= 0.25 && result.times.every((at, i) => Number.isFinite(at) && at >= 0.2 && at <= clip.duration - 0.2 && (!i || at - result.times[i - 1] >= 0.2));
}
export function shotCommand(prompt: string, scene: unknown): { op: "detect_shots"; id: string } | null {
  const text = prompt.toLowerCase().trim().replace(/[.!?]+$/, "");
  if (!/^(?:please\s+)?(?:split|cut|break up)(?:\s+(?:the|this|my))?\s+(?:video|clip)\s+(?:by|at|into)\s+(?:scenes|shots|scene changes)$/.test(text) || !scene || typeof scene !== "object") return null;
  const value = scene as { selected?: string[]; layers?: { id: string; kind: string; locked?: boolean; hidden?: boolean; duration?: number }[] };
  const clips = (value.layers ?? []).filter(c => c.kind === "video" && !c.hidden);
  const selected = clips.filter(c => value.selected?.includes(c.id));
  const clip = selected.length === 1 ? selected[0] : !value.selected?.length && clips.length === 1 ? clips[0] : undefined;
  return clip && !clip.locked && (!clip.duration || clip.duration <= 600) ? { op: "detect_shots", id: clip.id } : null;
}
export function shotTime(time: number): string {
  return `${Math.floor(time / 60).toString().padStart(2, "0")}:${(time % 60).toFixed(2).padStart(5, "0")}`;
}
