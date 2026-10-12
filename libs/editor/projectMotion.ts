import type { Clip } from "./types";

/** Animated text and graphics need a timeline export even without recorded media. */
export function hasTimelineMotion(clips: readonly Clip[]): boolean {
  return clips.some(clip => {
    if (clip.kind === "video" || clip.kind === "audio") return true;
    if ([clip.animateIn, clip.animateOut].some(animation => animation && animation.kind !== "none" && animation.duration > 0)) return true;
    if (clip.transitionOut && clip.transitionOut.duration > 0) return true;
    return Object.values(clip.keyframes ?? {}).some(keys => keys && keys.length > 1 && keys.some(key => key.t !== keys[0].t && key.v !== keys[0].v));
  });
}
