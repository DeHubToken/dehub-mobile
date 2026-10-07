import type { Clip, ClipKeyframes, MediaClip, Track, TransitionKind } from "./types";
import { shiftKeys } from "./keyframes";

/** Keep this contract and reducer identical in the web and mobile editors. */
export const TIMELINE_OPS = ["split", "segment", "trim", "remove_range", "sequence", "close_gaps", "repeat", "speed", "extract_audio", "audio", "transition", "timing"];
type Op = { op: string; [key: string]: unknown };
type Timeline = { clips: Clip[]; tracks: Track[] };
export interface TimelineResult extends Timeline { created: string[] }
const MIN = 0.05;
const EPS = 1e-6;
const number = (v: unknown): number | undefined => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const rate = (c: Clip) => c.kind === "video" || c.kind === "audio" ? (c.speed ?? 1) : 1;
const audible = (c: Clip): c is MediaClip => c.kind === "video" || c.kind === "audio";
const transitions: TransitionKind[] = ["fade", "slide-left", "slide-right", "wipe-left", "wipe-right"];

export function expandBatch(op: Op): Op[] | null {
  const allowed = ["effects", "place", "audio", "animate", "transition", "update"];
  if (!Array.isArray(op.ids) || !op.ids.length || op.ids.length > 100 || op.ids.some((x) => typeof x !== "string") ||
      !allowed.includes(String(op.action)) || !op.fields || typeof op.fields !== "object" || Array.isArray(op.fields)) return null;
  return [...new Set(op.ids as string[])].map((id) => ({ ...op.fields as Record<string, unknown>, op: String(op.action), id }));
}

/** Slice timeline seconds while keeping source offsets and clip-relative motion. */
function slice(c: Clip, offset: number, duration: number, id: string, start = c.start + offset): Clip {
  const end = offset + duration;
  return {
    ...c, id, start, duration,
    trimIn: audible(c) ? c.trimIn + offset * rate(c) : c.trimIn,
    keyframes: shiftKeys(c.keyframes, -offset),
    animateIn: offset > EPS ? undefined : c.animateIn,
    animateOut: end < c.duration - EPS ? undefined : c.animateOut,
    transitionOut: end < c.duration - EPS ? undefined : c.transitionOut,
    ...(audible(c) ? { audio: { ...c.audio,
      fadeIn: offset > EPS ? 0 : Math.min(c.audio?.fadeIn ?? 0, duration),
      fadeOut: end < c.duration - EPS ? 0 : Math.min(c.audio?.fadeOut ?? 0, duration),
    } } : {}),
  } as Clip;
}

/** Pure, bounded operations; invalid requests leave the input untouched. */
export function applyTimelineOp(state: Timeline, op: Op, makeId: () => string): TimelineResult | null {
  let clips = state.clips;
  let tracks = state.tracks;
  const created: string[] = [];
  const c = clips.find((x) => x.id === op.id);
  const result = (): TimelineResult => ({ clips, tracks, created });
  const replace = (target: Clip, parts: Clip[]) => { clips = clips.flatMap((x) => x.id === target.id ? parts : [x]); };
  const id = () => { const value = makeId(); created.push(value); return value; };
  const shiftLater = (target: Clip, delta: number): boolean => {
    if (Math.abs(delta) < EPS) return true;
    const later = clips.filter((x) => x.id !== target.id && x.trackId === target.trackId && x.start >= target.start + target.duration - EPS);
    if (later.some((x) => x.locked || x.start + delta < 0)) return false;
    const ids = new Set(later.map((x) => x.id));
    clips = clips.map((x) => ids.has(x.id) ? { ...x, start: x.start + delta } as Clip : x);
    return true;
  };
  const collision = (parts: Clip[], removed: Set<string>) => parts.some((a) => clips.some((b) =>
    !removed.has(b.id) && a.trackId === b.trackId && a.start < b.start + b.duration - EPS && a.start + a.duration > b.start + EPS));

  if (op.op === "sequence" || op.op === "close_gaps") {
    if (!Array.isArray(op.ids) || !op.ids.length || op.ids.length > 100 || op.ids.some((x) => typeof x !== "string")) return null;
    const ids = op.ids as string[];
    const chosen = ids.map((value) => clips.find((x) => x.id === value));
    if (new Set(ids).size !== ids.length || chosen.some((x) => !x || x.locked)) return null;
    const selected = chosen as Clip[];
    const start = number(op.start) ?? Math.min(...selected.map((x) => x.start));
    const gap = number(op.gap) ?? 0;
    if (start < 0 || gap < 0 || gap > 3600) return null;
    const replacements: Clip[] = [];
    if (op.op === "sequence") {
      const trackId = selected[0].trackId;
      if (selected.some((x) => x.trackId !== trackId)) return null;
      let cursor = start;
      for (const x of selected) { replacements.push({ ...x, start: cursor, transitionOut: undefined } as Clip); cursor += x.duration + gap; }
    } else {
      for (const trackId of new Set(selected.map((x) => x.trackId))) {
        const group = selected.filter((x) => x.trackId === trackId).sort((a, b) => a.start - b.start);
        let cursor = number(op.start) ?? group[0].start;
        for (const x of group) { replacements.push({ ...x, start: cursor, transitionOut: undefined } as Clip); cursor += x.duration; }
      }
    }
    if (collision(replacements, new Set(ids))) return null;
    clips = clips.map((x) => replacements.find((a) => a.id === x.id) ?? x);
    return result();
  }
  if (!c || c.locked) return null;

  switch (op.op) {
    case "split": {
      const at = number(op.at);
      if (at === undefined) return null;
      const offset = at - c.start;
      if (offset < MIN || c.duration - offset < MIN) return null;
      replace(c, [slice(c, 0, offset, c.id), slice(c, offset, c.duration - offset, id())]);
      return result();
    }
    case "segment": {
      const offset = number(op.offset) ?? 0;
      const count = number(op.count);
      const duration = number(op.duration) ?? (count ? (c.duration - offset) / count : undefined);
      if (offset < 0 || offset >= c.duration || duration === undefined || duration < MIN) return null;
      if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 100)) return null;
      const n = count ?? Math.ceil((c.duration - offset - EPS) / duration);
      if (n < 1 || n > 100 || (count !== undefined && offset + n * duration > c.duration + EPS)) return null;
      const parts: Clip[] = [];
      if (op.keepRemainder !== false && offset > EPS) parts.push(slice(c, 0, offset, c.id));
      for (let i = 0; i < n; i++) {
        const local = offset + i * duration;
        const length = Math.min(duration, c.duration - local);
        if (length < MIN) return null;
        parts.push(slice(c, local, length, parts.length ? id() : c.id));
      }
      const end = Math.min(c.duration, offset + n * duration);
      if (op.keepRemainder !== false && c.duration - end > EPS) {
        if (c.duration - end < MIN) return null;
        parts.push(slice(c, end, c.duration - end, id()));
      }
      replace(c, parts);
      return result();
    }
    case "trim": {
      const offset = number(op.offset) ?? 0;
      const duration = number(op.duration) ?? c.duration - offset;
      if (offset < 0 || duration < MIN || offset + duration > c.duration + EPS) return null;
      const start = number(op.start) ?? c.start;
      if (start < 0) return null;
      if (op.ripple === true && !shiftLater(c, duration - c.duration)) return null;
      const part = slice(c, offset, duration, c.id, start);
      if (collision([part], new Set([c.id]))) return null;
      replace(c, [part]);
      return result();
    }
    case "remove_range": {
      const from = number(op.from), to = number(op.to);
      if (from === undefined || to === undefined || from < 0 || to > c.duration + EPS || to - from < MIN) return null;
      if ((from > EPS && from < MIN) || (c.duration - to > EPS && c.duration - to < MIN)) return null;
      const ripple = op.ripple !== false;
      if (ripple && !shiftLater(c, from - to)) return null;
      const parts: Clip[] = [];
      if (from > EPS) parts.push(slice(c, 0, from, c.id));
      if (to < c.duration - EPS) parts.push(slice(c, to, c.duration - to, parts.length ? id() : c.id, c.start + (ripple ? from : to)));
      replace(c, parts);
      return result();
    }
    case "repeat": {
      const count = number(op.count);
      if (count === undefined || !Number.isInteger(count) || count < 1 || count > 100) return null;
      if (!shiftLater(c, count * c.duration)) return null;
      const parts = [c, ...Array.from({ length: count }, (_, i) => ({ ...c, id: id(), start: c.start + (i + 1) * c.duration } as Clip))];
      if (collision(parts, new Set([c.id]))) return null;
      replace(c, parts);
      return result();
    }
    case "speed": {
      const speed = number(op.speed);
      if (!audible(c) || speed === undefined || speed < 0.25 || speed > 4) return null;
      const ratio = rate(c) / speed;
      const duration = c.duration * ratio;
      if (duration < MIN) return null;
      if (op.ripple !== false && !shiftLater(c, duration - c.duration)) return null;
      const keys: ClipKeyframes = {};
      for (const prop of Object.keys(c.keyframes ?? {}) as (keyof ClipKeyframes)[]) keys[prop] = c.keyframes?.[prop]?.map((k) => ({ ...k, t: k.t * ratio }));
      const part: MediaClip = { ...c, speed, duration,
        keyframes: c.keyframes ? keys : undefined,
        audio: { ...c.audio, fadeIn: (c.audio?.fadeIn ?? 0) * ratio, fadeOut: (c.audio?.fadeOut ?? 0) * ratio },
        animateIn: c.animateIn ? { ...c.animateIn, duration: c.animateIn.duration * ratio } : undefined,
        animateOut: c.animateOut ? { ...c.animateOut, duration: c.animateOut.duration * ratio } : undefined,
        transitionOut: undefined,
      };
      if (collision([part], new Set([c.id]))) return null;
      replace(c, [part]);
      return result();
    }
    case "extract_audio": {
      if (c.kind !== "video") return null;
      const trackId = makeId();
      tracks = [...tracks, { id: trackId, kind: "audio", name: "Audio", muted: tracks.find((t) => t.id === c.trackId)?.muted ?? false, hidden: false }];
      const audio: MediaClip = { id: id(), trackId, kind: "audio", mediaId: c.mediaId, start: c.start, duration: c.duration,
        trimIn: c.trimIn, sourceDuration: c.sourceDuration, speed: c.speed, audio: { ...c.audio } };
      replace(c, [{ ...c, audio: { ...c.audio, volume: 0 } }, audio]);
      return result();
    }
    case "audio": {
      if (!audible(c)) return null;
      const audio = { ...c.audio };
      let changed = false;
      for (const field of ["volume", "fadeIn", "fadeOut"] as const) {
        if (op[field] === undefined) continue;
        const value = number(op[field]);
        if (value === undefined || value < 0 || value > (field === "volume" ? 2 : c.duration)) return null;
        audio[field] = value; changed = true;
      }
      if (!changed) return null;
      replace(c, [{ ...c, audio }]);
      return result();
    }
    case "transition": {
      if (c.kind === "audio") return null;
      if (op.kind === "none") { replace(c, [{ ...c, transitionOut: undefined } as Clip]); return result(); }
      const next = clips.find((x) => x.id !== c.id && x.trackId === c.trackId && Math.abs(x.start - c.start - c.duration) < 0.001);
      const duration = number(op.duration) ?? 0.5;
      if (!next || next.kind === "audio" || !transitions.includes(op.kind as TransitionKind) || duration <= 0) return null;
      replace(c, [{ ...c, transitionOut: { kind: op.kind as TransitionKind, duration: Math.min(duration, 2, c.duration / 2, next.duration / 2) } } as Clip]);
      return result();
    }
    case "timing": {
      const start = number(op.start) ?? c.start;
      const duration = number(op.duration) ?? c.duration;
      if (start < 0 || duration < MIN || (audible(c) && c.sourceDuration !== undefined && c.trimIn + duration * rate(c) > c.sourceDuration + EPS)) return null;
      const part = { ...c, start, duration } as Clip;
      if (collision([part], new Set([c.id]))) return null;
      replace(c, [part]);
      return result();
    }
    default: return null;
  }
}
