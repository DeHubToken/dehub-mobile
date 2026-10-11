import { subtitleClips } from "./subtitles";
import type { Clip, Track } from "./types";

export type CaptionTextProject = { clips: Clip[]; tracks: Track[] };
export interface CaptionTextPlan { sourceKey: string; updates: { id: string; text: string }[] }
export const editableCaptionText = (project: CaptionTextProject) => subtitleClips(project.clips, project.tracks).filter(clip => !clip.locked).sort((a, b) => a.start - b.start);
export const captionTextKey = (project: CaptionTextProject) => JSON.stringify(editableCaptionText(project));
const literal = (query: string, matchCase: boolean) => new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "gu" : "giu");
export const captionTextContains = (text: string, query: string, matchCase: boolean) => !query || literal(query, matchCase).test(text);

export function captionReplacement(project: CaptionTextProject, query: string, replacement: string, matchCase = false): CaptionTextPlan {
  if (query.length > 20_000 || replacement.length > 20_000) throw new Error("Caption text is too long");
  const updates = query ? editableCaptionText(project).flatMap(clip => {
    const text = clip.text.replace(literal(query, matchCase), () => replacement);
    return text === clip.text ? [] : [{ id: clip.id, text }];
  }) : [];
  const plan = { sourceKey: captionTextKey(project), updates };
  applyCaptionText(project, plan);
  return plan;
}

/** Validate every requested correction before changing any layer. */
export function applyCaptionText<T extends CaptionTextProject>(project: T, plan: CaptionTextPlan): T {
  if (captionTextKey(project) !== plan.sourceKey) throw new Error("Captions changed while editing");
  const captions = editableCaptionText(project), allowed = new Set(captions.map(clip => clip.id));
  const texts = new Map(plan.updates.map(update => [update.id, update.text]));
  if (new Set(project.clips.map(clip => clip.id)).size !== project.clips.length || allowed.size !== captions.length || texts.size !== plan.updates.length || plan.updates.some(update => !allowed.has(update.id) || typeof update.text !== "string" || update.text.length > 20_000)) {
    throw new Error("Caption correction is invalid");
  }
  let changed = false;
  const clips = project.clips.map(clip => {
    const text = texts.get(clip.id);
    if (clip.kind !== "text" || text === undefined || text === clip.text) return clip;
    changed = true;
    return { ...clip, text };
  });
  return changed ? { ...project, clips } : project;
}

export function captionTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  return `${Math.floor(total / 60_000)}:${String(Math.floor(total / 1000) % 60).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
}
