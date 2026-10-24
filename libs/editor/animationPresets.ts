/**
 * Entrance/exit animation presets applied per clip.
 * Compositor + exporter both call computeClipAnimation to derive an
 * (alpha, scale, dx, dy, blurPx) tuple at time t.
 */
import type { Clip, ClipAnimation, ClipAnimationKind } from "./types";

export interface AnimationPreset {
  kind: ClipAnimationKind;
  label: string;
}

export const ANIMATION_PRESETS: AnimationPreset[] = [
  { kind: "fade", label: "Fade" },
  { kind: "slide-up", label: "Slide up" },
  { kind: "slide-down", label: "Slide down" },
  { kind: "slide-left", label: "Slide left" },
  { kind: "slide-right", label: "Slide right" },
  { kind: "zoom-in", label: "Zoom in" },
  { kind: "zoom-out", label: "Zoom out" },
  { kind: "pop", label: "Pop" },
  { kind: "rise", label: "Rise" },
  { kind: "blur", label: "Blur" },
  { kind: "spin", label: "Spin" },
  { kind: "bounce", label: "Bounce" },
  { kind: "wipe-left", label: "Wipe left" },
  { kind: "wipe-right", label: "Wipe right" },
  { kind: "wipe-up", label: "Wipe up" },
  { kind: "wipe-down", label: "Wipe down" },
  { kind: "typewriter", label: "Typewriter" },
];

export const DEFAULT_ANIM_DURATION = 0.4;

export interface ClipAnimState {
  alpha: number;
  scale: number;
  dx: number; // fraction of canvas width
  dy: number; // fraction of canvas height
  blurPx: number;
  rotation?: number;
  textProgress?: number;
  reveals?: Array<{ axis: "x" | "y"; from: "start" | "end"; progress: number }>;
}

const IDENTITY: ClipAnimState = { alpha: 1, scale: 1, dx: 0, dy: 0, blurPx: 0 };

/** ease-out cubic */
function easeOut(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function stateFor(kind: ClipAnimationKind, p: number, direction: "in" | "out"): ClipAnimState {
  // p goes 0..1. For "in" we start at 0 (fully animated in), for "out" p goes
  // 0..1 as we approach the end — so translate p → progress-toward-hidden.
  const t = direction === "in" ? easeOut(p) : easeOut(1 - p);
  const inv = 1 - t;
  switch (kind) {
    case "fade":
      return { ...IDENTITY, alpha: t };
    case "slide-up":
      return { ...IDENTITY, alpha: t, dy: inv * 0.15 };
    case "slide-down":
      return { ...IDENTITY, alpha: t, dy: -inv * 0.15 };
    case "slide-left":
      return { ...IDENTITY, alpha: t, dx: inv * 0.15 };
    case "slide-right":
      return { ...IDENTITY, alpha: t, dx: -inv * 0.15 };
    case "zoom-in":
      return { ...IDENTITY, alpha: t, scale: 0.6 + t * 0.4 };
    case "zoom-out":
      return { ...IDENTITY, alpha: t, scale: 1 + inv * 0.4 };
    case "pop":
      return { ...IDENTITY, alpha: t, scale: 0.4 + t * (1.05 - 0.4) - (t > 0.85 ? (t - 0.85) * 0.33 : 0) };
    case "rise":
      return { ...IDENTITY, alpha: t, dy: inv * 0.06, scale: 0.95 + t * 0.05 };
    case "typewriter":
      return { ...IDENTITY, textProgress: direction === "in" ? p : 1 - p };
    case "spin":
      return { ...IDENTITY, alpha: t, rotation: -180 * inv };
    case "bounce":
      return { ...IDENTITY, alpha: t, dy: -Math.abs(Math.sin(t * Math.PI * 2.5)) * inv * 0.13 };
    case "wipe-left":
      return { ...IDENTITY, reveals: [{ axis: "x", from: "end", progress: t }] };
    case "wipe-right":
      return { ...IDENTITY, reveals: [{ axis: "x", from: "start", progress: t }] };
    case "wipe-up":
      return { ...IDENTITY, reveals: [{ axis: "y", from: "end", progress: t }] };
    case "wipe-down":
      return { ...IDENTITY, reveals: [{ axis: "y", from: "start", progress: t }] };
    case "blur":
      return { ...IDENTITY, alpha: t, blurPx: inv * 12 };
  }
  return { ...IDENTITY };
}

/** Compose the current animation state for a clip at absolute time t. */
export function computeClipAnimation(clip: Clip, t: number): ClipAnimState {
  const local = t - clip.start;
  const remaining = clip.start + clip.duration - t;
  let state: ClipAnimState = { ...IDENTITY };

  const inA = clip.animateIn;
  if (inA && inA.duration > 0 && local < inA.duration) {
    const p = Math.max(0, Math.min(1, local / inA.duration));
    state = merge(state, stateFor(inA.kind, p, "in"));
  }
  const outA = clip.animateOut;
  if (outA && outA.duration > 0 && remaining < outA.duration) {
    const p = Math.max(0, Math.min(1, 1 - remaining / outA.duration));
    state = merge(state, stateFor(outA.kind, p, "out"));
  }
  return state;
}

function merge(a: ClipAnimState, b: ClipAnimState): ClipAnimState {
  return {
    alpha: a.alpha * b.alpha,
    scale: a.scale * b.scale,
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    blurPx: Math.max(a.blurPx, b.blurPx),
    ...((a.textProgress !== undefined || b.textProgress !== undefined) ? { textProgress: Math.min(a.textProgress ?? 1, b.textProgress ?? 1) } : {}),
    ...((a.rotation !== undefined || b.rotation !== undefined) ? { rotation: (a.rotation ?? 0) + (b.rotation ?? 0) } : {}),
    ...((a.reveals || b.reveals) ? { reveals: [...(a.reveals ?? []), ...(b.reveals ?? [])] } : {}),
  };
}

export function newAnimation(kind: ClipAnimationKind): ClipAnimation {
  return { kind, duration: DEFAULT_ANIM_DURATION };
}
