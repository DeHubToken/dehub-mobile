import type { Clip, TextClip, Track } from "./types";

const validBound = (value: number | undefined): value is number => Number.isFinite(value) && value! > 0 && value! <= 1;

export const textWrapEnabled = (clip: Pick<TextClip, "maxWidth">) => validBound(clip.maxWidth);
export const textFitEnabled = (clip: Pick<TextClip, "maxWidth" | "maxHeight">) => textWrapEnabled(clip) && validBound(clip.maxHeight);

export function textWrapPatch(clip: TextClip, enabled: boolean): Partial<TextClip> {
  return enabled ? { maxWidth: validBound(clip.maxWidth) ? clip.maxWidth : 0.9 }
    : { maxWidth: undefined, maxHeight: undefined };
}

export function textFitPatch(clip: TextClip, enabled: boolean): Partial<TextClip> {
  return enabled ? { maxWidth: validBound(clip.maxWidth) ? clip.maxWidth : 0.9, maxHeight: validBound(clip.maxHeight) ? clip.maxHeight : 0.5 }
    : { maxHeight: undefined };
}

/** A caption track is fitted in one edit; wording, cue timing and styling stay intact. */
export function fitCaptionTrack<T extends { tracks: Track[]; clips: Clip[] }>(project: T, trackId: string): T {
  if (!project.tracks.some(track => track.id === trackId && track.kind === "text" && track.role === "captions")) return project;
  let changed = false;
  const clips = project.clips.map(clip => {
    if (clip.kind !== "text" || clip.trackId !== trackId || (clip.maxWidth === 0.9 && clip.maxHeight === 0.28)) return clip;
    changed = true;
    return { ...clip, maxWidth: 0.9, maxHeight: 0.28 };
  });
  return changed ? { ...project, clips } : project;
}
