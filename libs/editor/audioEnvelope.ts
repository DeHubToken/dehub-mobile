import type { MediaClip } from "./types";

/** The same linear envelope used by preview and exported audio. */
export function audioGainAt(clip: MediaClip, time: number): number {
  const local = time - clip.start;
  if (local < 0 || local >= clip.duration) return 0;
  const fadeIn = Math.max(0, Math.min(clip.duration, clip.audio?.fadeIn ?? 0));
  const fadeOut = Math.max(0, Math.min(clip.duration - fadeIn, clip.audio?.fadeOut ?? 0));
  const envelope = Math.min(1, fadeIn > 0 ? local / fadeIn : 1, fadeOut > 0 ? (clip.duration - local) / fadeOut : 1);
  return Math.max(0, (clip.audio?.volume ?? 1) * envelope);
}
