/**
 * Keyframed placement.
 * ====================
 * A clip's position, size, rotation and transparency can follow keys instead
 * of one static value. `resolveClipAt` bakes the keyed values into a plain
 * clip for one moment, so the renderer, hit testing and selection handles all
 * work on an ordinary clip and never need to know keyframes exist.
 *
 * Key times are seconds from the clip's start. Each key's `ease` shapes the
 * segment from that key to the next one, the same way motion tools do it.
 *
 * A copy of dehubweb src/lib/editor/keyframes.ts; keep the two identical. The
 * canvas page (canvasHtml.ts) carries its own port of the easing and
 * resolveClipAt, since it draws inside the WebView.
 */
import type { Clip, ClipKeyframes, ClipTransform, Ease, EasePreset, Keyframe, KeyframeProp } from "./types";
import { KEYFRAME_PROPS } from "./types";

/** Two keys closer than this (s) are the same key. About one frame at 60fps. */
export const KEY_EPSILON = 1 / 60;
export const DEFAULT_EASE: EasePreset = "ease";

const BEZIERS: Record<Exclude<EasePreset, "linear" | "hold">, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInExpo: [0.7, 0, 0.84, 0],
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInBack: [0.36, 0, 0.66, -0.56],
  easeOutBack: [0.34, 1.56, 0.64, 1],
  easeInOutBack: [0.68, -0.6, 0.32, 1.6],
};

/** The cubic-bezier behind an ease, or null for linear and hold. */
export function bezierOf(ease: Ease | undefined): [number, number, number, number] | null {
  const e = ease ?? DEFAULT_EASE;
  if (Array.isArray(e)) return e;
  if (e === "linear" || e === "hold") return null;
  return BEZIERS[e] ?? BEZIERS.ease;
}

/** CSS-style cubic-bezier timing: progress p (0..1) → eased progress. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  // Newton first; it converges in a few steps for every sane curve.
  let u = p;
  for (let i = 0; i < 8; i++) {
    const err = sx(u) - p;
    if (Math.abs(err) < 1e-6) return sy(u);
    const d = dx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= err / d;
  }
  // Bisection for the flat spots Newton cannot handle.
  let lo = 0, hi = 1;
  u = p;
  for (let i = 0; i < 30; i++) {
    const x = sx(u);
    if (Math.abs(x - p) < 1e-6) break;
    if (x < p) lo = u; else hi = u;
    u = (lo + hi) / 2;
  }
  return sy(u);
}

export function applyEase(ease: Ease | undefined, p: number): number {
  if (ease === "hold") return 0;
  const b = bezierOf(ease);
  return b ? cubicBezier(b[0], b[1], b[2], b[3], p) : p;
}

/** Properties a clip can keyframe. */
export function keyframeProps(clip: Clip): KeyframeProp[] {
  if (clip.kind === "audio") return [];
  return clip.kind === "text" ? KEYFRAME_PROPS.filter((p) => p !== "scale") : [...KEYFRAME_PROPS];
}

/** The static (un-keyed) value of a property. */
export function staticValue(clip: Clip, prop: KeyframeProp): number {
  if (clip.kind === "text" && (prop === "x" || prop === "y")) return clip[prop];
  const tr = clip.transform;
  switch (prop) {
    case "x": return tr?.x ?? 0.5;
    case "y": return tr?.y ?? 0.5;
    case "scale": return tr?.scale ?? 1;
    case "rotation": return tr?.rotation ?? 0;
    case "opacity": return tr?.opacity ?? 1;
  }
}

export function keysOf(clip: Clip, prop: KeyframeProp): Keyframe[] {
  return clip.keyframes?.[prop] ?? [];
}

export function isAnimated(clip: Clip, prop?: KeyframeProp): boolean {
  const k = clip.keyframes;
  if (!k) return false;
  if (prop) return (k[prop]?.length ?? 0) > 0;
  return KEYFRAME_PROPS.some((p) => (k[p]?.length ?? 0) > 0);
}

/** Value of sorted keys at local time t. */
export function valueAt(keys: Keyframe[], t: number): number {
  if (keys.length === 1 || t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t < b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.v;
      return a.v + (b.v - a.v) * applyEase(a.ease, (t - a.t) / span);
    }
  }
  return last.v;
}

/** A property's value at timeline time t, keyed or static. */
export function propAt(clip: Clip, prop: KeyframeProp, t: number): number {
  const keys = keysOf(clip, prop);
  return keys.length ? valueAt(keys, t - clip.start) : staticValue(clip, prop);
}

/**
 * The clip as it stands at timeline time t: keyed values baked into its
 * transform (and text anchor). Returns the same object when nothing is keyed,
 * so unanimated projects pay nothing.
 */
export function resolveClipAt<C extends Clip>(clip: C, t: number): C {
  if (!isAnimated(clip)) return clip;
  const local = t - clip.start;
  const tr: ClipTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...(clip.transform ?? {}) };
  const out = { ...clip } as C;
  for (const p of keyframeProps(clip)) {
    const keys = keysOf(clip, p);
    if (!keys.length) continue;
    const v = valueAt(keys, local);
    tr[p] = v;
    if (clip.kind === "text" && (p === "x" || p === "y")) (out as unknown as { x: number; y: number })[p] = v;
  }
  out.transform = tr;
  return out;
}

/** The key of `prop` at local time t, if one sits there. */
export function keyAt(clip: Clip, prop: KeyframeProp, local: number): Keyframe | undefined {
  return keysOf(clip, prop).find((k) => Math.abs(k.t - local) < KEY_EPSILON);
}

/** Every distinct key time on the clip, ascending. */
export function keyTimes(clip: Clip): number[] {
  const times: number[] = [];
  for (const p of KEYFRAME_PROPS) {
    for (const k of keysOf(clip, p)) {
      if (!times.some((x) => Math.abs(x - k.t) < KEY_EPSILON)) times.push(k.t);
    }
  }
  return times.sort((a, b) => a - b);
}

function withProp(clip: Clip, prop: KeyframeProp, keys: Keyframe[]): ClipKeyframes | undefined {
  const next: ClipKeyframes = { ...(clip.keyframes ?? {}) };
  if (keys.length) next[prop] = keys.sort((a, b) => a.t - b.t);
  else delete next[prop];
  return Object.keys(next).length ? next : undefined;
}

/** Keyframes with a key for `prop` set (added or replaced) at local time t. */
export function setKey(clip: Clip, prop: KeyframeProp, local: number, v: number, ease?: Ease): ClipKeyframes | undefined {
  const keys = keysOf(clip, prop);
  const existing = keys.find((k) => Math.abs(k.t - local) < KEY_EPSILON);
  const rest = keys.filter((k) => k !== existing);
  const t = existing ? existing.t : Math.max(0, local);
  return withProp(clip, prop, [...rest, { t, v, ease: ease ?? existing?.ease ?? keys.find((k) => k.t < t)?.ease ?? DEFAULT_EASE }]);
}

/** Keyframes without the key for `prop` at local time t. */
export function removeKey(clip: Clip, prop: KeyframeProp, local: number): ClipKeyframes | undefined {
  return withProp(clip, prop, keysOf(clip, prop).filter((k) => Math.abs(k.t - local) >= KEY_EPSILON));
}

/**
 * Patch that stops animating `prop`: keys dropped, and the value it had at
 * timeline time t kept as its static value so nothing jumps.
 */
export function stopAnimatingPatch(clip: Clip, prop: KeyframeProp, t: number): Partial<Clip> {
  const v = propAt(clip, prop, t);
  const keyframes = withProp(clip, prop, []);
  const transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...(clip.transform ?? {}), [prop]: v };
  const patch: Record<string, unknown> = { keyframes, transform };
  if (clip.kind === "text" && (prop === "x" || prop === "y")) patch[prop] = v;
  return patch as Partial<Clip>;
}

/** Move every key at local time `from` to `to` (all properties together). */
export function retimeKeys(clip: Clip, from: number, to: number): ClipKeyframes | undefined {
  if (!clip.keyframes) return undefined;
  const next: ClipKeyframes = {};
  const target = Math.max(0, to);
  for (const p of KEYFRAME_PROPS) {
    const keys = clip.keyframes[p];
    if (!keys?.length) continue;
    const moving = keys.find((k) => Math.abs(k.t - from) < KEY_EPSILON);
    // A key already sitting at the target is replaced by the one being dragged.
    const rest = keys.filter((k) => k !== moving && (!moving || Math.abs(k.t - target) >= KEY_EPSILON));
    next[p] = (moving ? [...rest, { ...moving, t: target }] : rest).sort((a, b) => a.t - b.t);
  }
  return next;
}

/** Remove every key at local time t, on all properties. */
export function removeKeysAt(clip: Clip, local: number): ClipKeyframes | undefined {
  if (!clip.keyframes) return undefined;
  const next: ClipKeyframes = {};
  for (const p of KEYFRAME_PROPS) {
    const keys = clip.keyframes[p]?.filter((k) => Math.abs(k.t - local) >= KEY_EPSILON);
    if (keys?.length) next[p] = keys;
  }
  return Object.keys(next).length ? next : undefined;
}

/** Shift every key by dt seconds (a trim or split moved the clip's start). */
export function shiftKeys(keyframes: ClipKeyframes | undefined, dt: number): ClipKeyframes | undefined {
  if (!keyframes || !dt) return keyframes;
  const next: ClipKeyframes = {};
  for (const p of KEYFRAME_PROPS) {
    const keys = keyframes[p];
    if (keys?.length) next[p] = keys.map((k) => ({ ...k, t: k.t + dt }));
  }
  return next;
}

/**
 * The key time whose outgoing curve is "current" at local time t: a key right
 * at t, otherwise the last key before t. Null when there is none.
 */
export function activeKeyTime(clip: Clip, local: number): number | null {
  const times = keyTimes(clip);
  let best: number | null = null;
  for (const k of times) {
    if (k <= local + KEY_EPSILON) best = k;
  }
  return best;
}

/** The ease of the first key at local time t, for showing in the curve editor. */
export function easeAt(clip: Clip, local: number): Ease {
  for (const p of KEYFRAME_PROPS) {
    const k = keyAt(clip, p, local);
    if (k) return k.ease ?? DEFAULT_EASE;
  }
  return DEFAULT_EASE;
}

/** Set the ease on every key at local time t (all properties), or on every key when t is null. */
export function setEaseAt(clip: Clip, local: number | null, ease: Ease): ClipKeyframes | undefined {
  if (!clip.keyframes) return undefined;
  const next: ClipKeyframes = {};
  for (const p of KEYFRAME_PROPS) {
    const keys = clip.keyframes[p];
    if (!keys?.length) continue;
    next[p] = keys.map((k) => (local === null || Math.abs(k.t - local) < KEY_EPSILON ? { ...k, ease } : k));
  }
  return next;
}

/** Sanitise keyframes from an untrusted source (the agent, an old save). */
export function cleanKeys(raw: unknown, clamp: (v: number) => number): Keyframe[] {
  if (!Array.isArray(raw)) return [];
  const out: Keyframe[] = [];
  for (const k of raw.slice(0, 60)) {
    if (!k || typeof k !== "object") continue;
    const t = Number((k as { t?: unknown }).t);
    const v = Number((k as { v?: unknown }).v);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    const e = (k as { ease?: unknown }).ease;
    const ease = isEase(e) ? e : undefined;
    out.push({ t: Math.max(0, t), v: clamp(v), ...(ease ? { ease } : {}) });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function isEase(e: unknown): e is Ease {
  if (typeof e === "string") return e in BEZIERS || e === "linear" || e === "hold";
  return Array.isArray(e) && e.length === 4 && e.every((n) => typeof n === "number" && Number.isFinite(n))
    && e[0] >= 0 && e[0] <= 1 && e[2] >= 0 && e[2] <= 1;
}
