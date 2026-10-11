import { findVisualScenes, visualWindowPlan, type VisualAnalyser, type VisualSampler } from "./visualHighlights";
import type { MediaClip } from "./types";

export interface AssemblyScene { id: string; offset: number; duration: number; score: number; text: string }
export type AssemblySceneMatcher = (clips: MediaClip[], focus: string, signal: AbortSignal, progress: (fraction: number) => void) => Promise<AssemblyScene[]>;

/** Keep explicit names and ordinary join commands on the local assembly path. */
export function assemblyFocus(prompt: string): string | undefined {
  const text = prompt.trim().replace(/[.!?]+$/, "");
  const after = /\b(?:focusing on|focused on|about|featuring|showing)\s+(.+?)(?=\s+(?:from|using|with my|with these|without|with music|with fades)\b|$)/i.exec(text);
  const of = /\b(?:video|montage|slideshow|film|reel|story|edit)\s+of\s+(.+?)(?=\s+(?:from|using|with my|with these|without|with music|with fades)\b|$)/i.exec(text);
  const value = (after?.[1] ?? of?.[1])?.trim();
  if (!value || value.length < 2 || value.length > 240 || /^(?:my|these|the selected|selected)\s+(?:clips?|videos?|photos?|images?|footage|media)\b/i.test(value)) return undefined;
  return value;
}

/** Only opted-in frame previews reach the existing visual analyser. */
export async function findAssemblyScenes(clips: MediaClip[], focus: string, options: { optIn: true }, sample: VisualSampler, analyse: VisualAnalyser, signal: AbortSignal, progress: (fraction: number) => void): Promise<AssemblyScene[]> {
  const check = () => { if (signal.aborted) throw new Error("cancelled"); };
  check();
  if (options.optIn !== true || focus.trim().length < 2 || focus.length > 240 || !clips.length || clips.length > 10
    || clips.some(clip => clip.kind !== "image" && clip.kind !== "video" || clip.hidden || clip.locked || !Number.isFinite(clip.duration) || clip.duration < 0.05 || clip.kind === "video" && clip.duration < 1)) throw new Error("assembly_scene_limit");
  const sampledClips = clips.map(clip => clip.kind === "image" ? { ...clip, duration: 1, trimIn: 0, speed: 1 } : clip);
  try { for (const clip of sampledClips) visualWindowPlan(clip); } catch { throw new Error("assembly_scene_limit"); }
  const scenes: AssemblyScene[] = [];
  for (const [index, clip] of clips.entries()) {
    check();
    // A still needs one sampled window, regardless of its chosen screen time.
    const sampled = sampledClips[index];
    const moments = await findVisualScenes(sampled, { optIn: true, focus: focus.trim() }, sample, analyse, signal,
      fraction => progress((index + fraction) / clips.length));
    check();
    const matches = clip.kind === "image" ? [...moments].sort((a, b) => b.score - a.score).slice(0, 1) : moments;
    for (const moment of matches) scenes.push({ id: clip.id, offset: clip.kind === "image" ? 0 : moment.start, duration: clip.kind === "image" ? clip.duration : moment.end - moment.start, score: moment.score, text: moment.text });
    progress((index + 1) / clips.length);
  }
  return scenes.sort((a, b) => b.score - a.score).slice(0, 100);
}
