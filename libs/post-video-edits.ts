/**
 * Post video edits: mirror, quarter turns, and the photo studio's look +
 * adjust dials. The app previews them; the server bakes them into the video
 * (user_mint `videoEdits`). Same as dehubweb `features/post/lib/video-edits.ts`.
 */
import { DEFAULT_ADJUST, studioColorMatrix, type StudioAdjust } from "./imageFilters";

export interface PostVideoEdits {
  mirror?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  look?: string;
  /** Look strength, 0..100. */
  strength?: number;
  adjust?: StudioAdjust;
}

export interface VideoEditsPayload {
  mirror?: boolean;
  rotate?: 90 | 180 | 270;
  matrix?: number[];
  vignette?: number;
}

export function videoEditsMatrix(e?: PostVideoEdits | null): number[] | null {
  if (!e) return null;
  return studioColorMatrix(e.look, e.strength ?? 100, e.adjust ?? DEFAULT_ADJUST);
}

/** What user_mint takes, or null when nothing changes the picture. */
export function videoEditsPayload(e?: PostVideoEdits | null): VideoEditsPayload | null {
  if (!e) return null;
  const out: VideoEditsPayload = {};
  if (e.mirror) out.mirror = true;
  if (e.rotate) out.rotate = e.rotate;
  const matrix = videoEditsMatrix(e);
  if (matrix) out.matrix = matrix.map((v) => Math.round(v * 10000) / 10000);
  const vignette = e.adjust?.vignette ?? 0;
  if (vignette > 0) out.vignette = vignette;
  return Object.keys(out).length ? out : null;
}

/** Self-destructing posts: how long the post stays up. Same list as the backend. */
export const POST_DESTRUCT_CHOICES = [3600, 43200, 86400, 604800, 2592000] as const;

export function postDestructLabel(s: number): string {
  switch (s) {
    case 3600: return "1 hour";
    case 43200: return "12 hours";
    case 86400: return "1 day";
    case 604800: return "7 days";
    case 2592000: return "30 days";
    default: return `${Math.round(s / 3600)} hours`;
  }
}

export function postDestructShort(s: number): string {
  return s % 86400 === 0 ? `${s / 86400}d` : `${Math.round(s / 3600)}h`;
}
