import { subtitleClips } from "./subtitles";
import type { Clip, Track } from "./types";

type CaptionProject = { clips: Clip[]; tracks: Track[] };
export interface CaptionTranslationPlan { sourceKey: string; cues: { id: string; text: string }[] }
export interface CaptionTranslationUpdate { id: string; text: string }
const editableCaptions = (project: CaptionProject) => subtitleClips(project.clips, project.tracks).filter(clip => !clip.locked && clip.text.trim());
export const captionTranslationKey = (project: CaptionProject) => JSON.stringify(editableCaptions(project));

export function planCaptionTranslation(project: CaptionProject): CaptionTranslationPlan {
  const captions = editableCaptions(project);
  if (!captions.length || captions.some(clip => clip.text.length > 20_000) || new Set(captions.map(clip => clip.id)).size !== captions.length) {
    throw new Error("Caption translation source is unavailable");
  }
  return { sourceKey: JSON.stringify(captions), cues: captions.map(({ id, text }) => ({ id, text })) };
}

function cancelled(): Error {
  const error = new Error("Caption translation cancelled");
  error.name = "AbortError";
  return error;
}

function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(cancelled()); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { if (signal.aborted) throw cancelled(); return work(); }).then(
      value => { signal.removeEventListener("abort", abort); signal.aborted ? reject(cancelled()) : resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

/** Full cue text is translated on request, outside the scene and operation limits. */
export async function translateCaptionPlan(plan: CaptionTranslationPlan, targetLang: string, options: {
  signal: AbortSignal;
  translate: (text: string, targetLang: string) => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
}): Promise<CaptionTranslationUpdate[]> {
  if (!/^[a-z]{2,8}(?:[_-][a-z]{2,8})?$/.test(targetLang) || !plan.cues.length) throw new Error("Caption translation target is unavailable");
  const translated = new Map<string, string>();
  const updates: CaptionTranslationUpdate[] = [];
  options.onProgress?.(0, plan.cues.length);
  for (const cue of plan.cues) {
    if (options.signal.aborted) throw cancelled();
    let text = translated.get(cue.text);
    if (text === undefined) {
      const result = await abortable(() => options.translate(cue.text, targetLang), options.signal);
      if (typeof result !== "string" || !result.trim() || result.length > 20_000) throw new Error("Caption translation returned invalid text");
      text = result;
      translated.set(cue.text, text);
    }
    if (options.signal.aborted) throw cancelled();
    updates.push({ id: cue.id, text });
    options.onProgress?.(updates.length, plan.cues.length);
  }
  return updates;
}

/** Accept the complete result once; stale, locked or changed cues cannot be overwritten. */
export function applyCaptionTranslation<T extends CaptionProject>(project: T, plan: CaptionTranslationPlan, updates: CaptionTranslationUpdate[]): T {
  if (captionTranslationKey(project) !== plan.sourceKey) throw new Error("Captions changed during translation");
  const texts = new Map(updates.map(update => [update.id, update.text]));
  if (texts.size !== plan.cues.length || updates.length !== plan.cues.length || plan.cues.some(cue => {
    const text = texts.get(cue.id);
    return typeof text !== "string" || !text.trim() || text.length > 20_000;
  })) throw new Error("Caption translation is incomplete");
  let changed = false;
  const clips = project.clips.map(clip => {
    const text = texts.get(clip.id);
    if (clip.kind !== "text" || text === undefined || text === clip.text) return clip;
    changed = true;
    return { ...clip, text };
  });
  return changed ? { ...project, clips } : project;
}
