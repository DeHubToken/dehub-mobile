import type { MediaClip } from "./types";
import type { HighlightRange } from "./highlights";
import { validVisualBatch, validVisualWindows, VISUAL_BATCH_WINDOWS, type VisualBatch, type VisualFrame, type VisualWindow } from "./visualHighlightContract";
export type VisualSampler = (clip: MediaClip, windows: VisualWindow[], signal: AbortSignal, progress: (fraction: number) => void) => Promise<VisualFrame[]>;
export type VisualAnalyser = (batch: VisualBatch, signal: AbortSignal) => Promise<HighlightRange[]>;
const check = (signal: AbortSignal) => { if (signal.aborted) throw new Error("cancelled"); };
export function visualWindowPlan(clip: MediaClip): VisualWindow[] {
  const speed = clip.speed ?? 1;
  if (clip.kind !== "video" || clip.hidden || clip.locked || !Number.isFinite(speed) || speed < 0.25 || speed > 4 || !Number.isFinite(clip.trimIn) || clip.trimIn < 0
    || !Number.isFinite(clip.duration) || clip.duration < 1 || clip.duration > 600 || clip.duration * speed > 600) throw new Error("highlight_limit");
  const count = Math.ceil(clip.duration / 6), round = (n: number) => Math.round(n * 1000) / 1000;
  return Array.from({ length: count }, (_, id) => ({ id, start: round(id * clip.duration / count), end: round((id + 1) * clip.duration / count) }));
}

/** Explicit visual mode never transcribes speech or sends source files and names. */
export async function findVisualHighlights(clip: MediaClip, options: { optIn: true; seconds: number; focus?: string }, sample: VisualSampler, analyse: VisualAnalyser, signal: AbortSignal, progress?: (fraction: number) => void): Promise<HighlightRange[]> {
  check(signal);
  if (options.optIn !== true || ![15, 30, 60].includes(options.seconds)) throw new Error("highlight_limit");
  const windows = visualWindowPlan(clip), candidates: HighlightRange[] = [];
  const count = Math.ceil(windows.length / VISUAL_BATCH_WINDOWS);
  for (let page = 0; page < count; page++) {
    check(signal);
    const group = windows.slice(page * VISUAL_BATCH_WINDOWS, (page + 1) * VISUAL_BATCH_WINDOWS);
    if (!validVisualWindows(group, clip.duration)) throw new Error("highlight_limit");
    const frames = await sample(clip, group, signal, fraction => progress?.((page + Math.max(0, Math.min(1, fraction)) * 0.5) / count));
    check(signal);
    const batch: VisualBatch = { optIn: true, duration: clip.duration, seconds: options.seconds, focus: options.focus?.trim().slice(0, 240) ?? "", windows: group, frames };
    if (!validVisualBatch(batch)) throw new Error("visual_frames_invalid");
    const result = await analyse(batch, signal);
    check(signal);
    // Verify server results again against the local windows and budget.
    if (!Array.isArray(result) || result.length > 8) throw new Error("visual_answer_invalid");
    candidates.push(...result.filter(range => range && Number.isFinite(range.score) && range.score >= 0.75 && range.score <= 1
      && typeof range.text === "string" && range.text.length >= 4 && range.text.length <= 240
      && group.some(w => w.start === range.start) && group.some(w => w.end === range.end)
      && range.end > range.start && range.end - range.start <= options.seconds + 0.001));
    progress?.((page + 1) / count);
  }
  const selected: HighlightRange[] = []; let duration = 0;
  for (const range of candidates.sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (selected.length >= 8 || duration + range.end - range.start > options.seconds + 0.001 || selected.some(m => range.start < m.end && range.end > m.start)) continue;
    selected.push(range); duration += range.end - range.start;
  }
  return selected.sort((a, b) => a.start - b.start);
}
