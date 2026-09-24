/**
 * Timeline editing: putting videos and sounds in order, trimming, splitting,
 * moving, speed and transitions. Pure functions on a ProjectSnapshot, like
 * project.ts, following the web editor's store rules (dehubweb
 * src/store/editorStore.ts and src/lib/editor/transitions.ts) so a video cut
 * here plays the same on the web.
 */
import type { Clip, MediaClip, ProjectSnapshot, Track, TrackKind, Transition, TransitionKind } from "./types";
import { newId, timelineEnd } from "./project";

/** Shortest a clip can be trimmed to, in seconds (web MIN_CLIP is 0.05; a finger needs more). */
export const MIN_CLIP = 0.2;
export const DEFAULT_TRANSITION_DURATION = 0.5;
export const MAX_TRANSITION_DURATION = 3;
export const MIN_TRANSITION_DURATION = 0.1;
export const TRANSITION_KINDS: TransitionKind[] = ["fade", "slide-left", "slide-right", "wipe-left", "wipe-right"];
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3];

/** A project is a video once it has a video or a sound in it. */
export function isVideoProject(p: ProjectSnapshot): boolean {
  return p.clips.some((c) => c.kind === "video" || c.kind === "audio");
}

export function projectDuration(p: ProjectSnapshot): number {
  return timelineEnd(p);
}

function speedOf(c: Clip): number {
  return c.kind !== "text" && c.kind !== "shape" && c.speed && c.speed > 0 ? c.speed : 1;
}

/** Push right until there is no overlap on the track (web findFreeStart). */
export function findFreeStart(clips: Clip[], trackId: string, desired: number, duration: number, ignoreId?: string): number {
  let start = Math.max(0, desired);
  const onTrack = clips.filter((c) => c.trackId === trackId && c.id !== ignoreId).sort((a, b) => a.start - b.start);
  for (const c of onTrack) {
    if (start + duration <= c.start + 1e-6) break;
    if (start < c.start + c.duration - 1e-6) start = c.start + c.duration;
  }
  return start;
}

function trackName(p: ProjectSnapshot, kind: TrackKind): string {
  const count = p.tracks.filter((t) => t.kind === kind).length + 1;
  if (kind === "text") return `Text ${count}`;
  return kind === "audio" ? `Audio ${count}` : `Video ${count}`;
}

/**
 * The track videos play on in sequence: the lowest video track that holds a
 * video, else the lowest free video track, else a new one at the bottom, so
 * the footage sits under every picture and text layer.
 */
function mainVideoTrack(p: ProjectSnapshot): { tracks: Track[]; trackId: string } {
  const videoTracks = p.tracks.filter((t) => t.kind === "video");
  const withVideo = videoTracks.find((t) => p.clips.some((c) => c.trackId === t.id && c.kind === "video"));
  if (withVideo) return { tracks: p.tracks, trackId: withVideo.id };
  const empty = videoTracks.find((t) => !p.clips.some((c) => c.trackId === t.id));
  if (empty && p.tracks.indexOf(empty) === p.tracks.findIndex((t) => t.kind === "video")) return { tracks: p.tracks, trackId: empty.id };
  const track: Track = { id: newId(8), kind: "video", name: trackName(p, "video"), muted: false, hidden: false };
  return { tracks: [track, ...p.tracks], trackId: track.id };
}

/** A sound track free for [at, at + duration), or a new one. */
function audioTrackFor(p: ProjectSnapshot, at: number, duration: number): { tracks: Track[]; trackId: string } {
  const free = p.tracks.find(
    (t) => t.kind === "audio" && !p.clips.some((c) => c.trackId === t.id && c.start < at + duration && c.start + c.duration > at),
  );
  if (free) return { tracks: p.tracks, trackId: free.id };
  const track: Track = { id: newId(8), kind: "audio", name: trackName(p, "audio"), muted: false, hidden: false };
  return { tracks: [...p.tracks, track], trackId: track.id };
}

/**
 * Add a video at the end of the main video track, or a sound at `at` (the
 * playhead). Pictures, text and shapes already spanning the old length keep
 * running to the new end, so a still design with a video added under it does
 * not go blank part way through.
 */
export function addClip(
  p: ProjectSnapshot,
  media: { id: string; kind: "video" | "audio"; duration: number },
  at = 0,
): { project: ProjectSnapshot; clipId: string } {
  const duration = Math.max(MIN_CLIP, media.duration || 5);
  const oldEnd = timelineEnd(p);
  let tracks: Track[];
  let trackId: string;
  let start: number;
  if (media.kind === "video") {
    ({ tracks, trackId } = mainVideoTrack(p));
    const onTrack = p.clips.filter((c) => c.trackId === trackId);
    start = onTrack.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  } else {
    ({ tracks, trackId } = audioTrackFor(p, at, duration));
    start = findFreeStart(p.clips, trackId, at, duration);
  }
  const clip: MediaClip = {
    id: newId(10),
    trackId,
    kind: media.kind,
    start,
    duration,
    trimIn: 0,
    mediaId: media.id,
    sourceDuration: media.duration || undefined,
    ...(media.kind === "video" ? { fit: "cover" as const } : {}),
  };
  const newEnd = Math.max(oldEnd, start + duration);
  const clips = p.clips.map((c) =>
    (c.kind === "image" || c.kind === "text" || c.kind === "shape") && c.start === 0 && Math.abs(c.start + c.duration - oldEnd) < 1e-6 && newEnd > oldEnd
      ? ({ ...c, duration: newEnd } as Clip)
      : c,
  );
  return { project: { ...p, tracks, clips: [...clips, clip] }, clipId: clip.id };
}

/** Set a clip's length from its source once the canvas knows the real duration. */
export function setSourceDuration(p: ProjectSnapshot, mediaId: string, seconds: number): ProjectSnapshot {
  if (!(seconds > 0)) return p;
  let changed = false;
  const clips = p.clips.map((c) => {
    if (c.kind === "text" || c.kind === "shape" || c.kind === "image" || c.mediaId !== mediaId) return c;
    if (c.sourceDuration && Math.abs(c.sourceDuration - seconds) < 0.05) return c;
    changed = true;
    const maxDur = Math.max(MIN_CLIP, (seconds - c.trimIn) / speedOf(c));
    return { ...c, sourceDuration: seconds, duration: Math.min(c.duration, maxDur) };
  });
  return changed ? { ...p, clips } : p;
}

/**
 * Drag one end of a clip (web trimClip). Delta in timeline seconds; the in
 * edge moves the source with it, the out edge stops at the end of the source.
 */
export function trimClip(p: ProjectSnapshot, id: string, edge: "in" | "out", delta: number): ProjectSnapshot {
  const clip = p.clips.find((c) => c.id === id);
  if (!clip) return p;
  let { start, duration, trimIn } = clip;
  const sp = speedOf(clip);
  const isSource = clip.kind === "video" || clip.kind === "audio";
  const neighbours = p.clips.filter((c) => c.trackId === clip.trackId && c.id !== id);
  if (clip.kind === "video") {
    // Videos stay back to back, like a phone editor: the start stays put and
    // everything after it on the track slides along (ripple).
    const src = (clip as MediaClip).sourceDuration ?? Infinity;
    let newTrimIn = trimIn;
    let newDur = duration;
    if (edge === "in") {
      const d = Math.max(-trimIn / sp, Math.min(delta, duration - MIN_CLIP));
      newTrimIn = Math.max(0, trimIn + d * sp);
      newDur = duration - d;
    } else {
      newDur = Math.max(MIN_CLIP, Math.min(duration + delta, (src - trimIn) / sp));
    }
    const shift = newDur - duration;
    const end = clip.start + clip.duration;
    return {
      ...p,
      clips: p.clips.map((c) => {
        if (c.id === id) return { ...c, trimIn: newTrimIn, duration: newDur } as Clip;
        if (c.trackId === clip.trackId && c.start >= end - 1e-6) return { ...c, start: Math.max(0, c.start + shift) } as Clip;
        return c;
      }),
    };
  }
  if (edge === "in") {
    // Not past the clip before it, not before the start of the source.
    const prevEnd = neighbours.filter((c) => c.start + c.duration <= clip.start + 1e-6).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    let newStart = Math.max(prevEnd, start + delta);
    if (isSource) newStart = Math.max(newStart, start - trimIn / sp);
    newStart = Math.min(newStart, start + duration - MIN_CLIP);
    const shift = newStart - start;
    if (isSource) trimIn = Math.max(0, trimIn + shift * sp);
    start = newStart;
    duration -= shift;
  } else {
    const nextStart = neighbours.filter((c) => c.start >= clip.start + clip.duration - 1e-6).reduce((m, c) => Math.min(m, c.start), Infinity);
    let newDur = Math.max(MIN_CLIP, duration + delta);
    newDur = Math.min(newDur, nextStart - start);
    if (isSource && clip.kind !== "image" && (clip as MediaClip).sourceDuration) {
      newDur = Math.min(newDur, ((clip as MediaClip).sourceDuration! - trimIn) / sp);
    }
    duration = Math.max(MIN_CLIP, newDur);
  }
  const next = { ...clip, start, duration, trimIn } as Clip;
  return { ...p, clips: p.clips.map((c) => (c.id === id ? next : c)) };
}

/** Move a clip in time on its track, landing on the nearest free spot (web moveClip). */
export function moveClip(p: ProjectSnapshot, id: string, desired: number): ProjectSnapshot {
  const clip = p.clips.find((c) => c.id === id);
  if (!clip) return p;
  const others = p.clips.filter((c) => c.id !== id && c.trackId === clip.trackId).sort((a, b) => a.start - b.start);
  if (clip.kind === "video" && others.every((c) => c.kind === "video")) {
    // Reorder the sequence instead: drop the clip where its middle lands.
    const centre = desired + clip.duration / 2;
    const order = others.slice();
    let at = order.findIndex((c) => centre < c.start + c.duration / 2);
    if (at < 0) at = order.length;
    order.splice(at, 0, clip);
    let t = order.length ? Math.min(...order.map((c) => c.start).concat(clip.start)) : 0;
    t = Math.max(0, Math.min(t, others[0]?.start ?? t));
    const starts = new Map<string, number>();
    for (const c of order) { starts.set(c.id, t); t += c.duration; }
    return { ...p, clips: p.clips.map((c) => (starts.has(c.id) ? ({ ...c, start: starts.get(c.id)! } as Clip) : c)) };
  }
  let start = Math.max(0, desired);
  for (const o of others) {
    const overlap = start < o.start + o.duration - 1e-6 && start + clip.duration > o.start + 1e-6;
    if (overlap) {
      const left = o.start - clip.duration;
      const right = o.start + o.duration;
      start = Math.abs(desired - left) < Math.abs(desired - right) && left >= 0 ? left : right;
    }
  }
  if (others.some((o) => start < o.start + o.duration - 1e-6 && start + clip.duration > o.start + 1e-6)) return p;
  return { ...p, clips: p.clips.map((c) => (c.id === id ? ({ ...c, start } as Clip) : c)) };
}

/** Cut a clip in two at time t (web splitAtPlayhead, for one clip). */
export function splitClip(p: ProjectSnapshot, id: string, t: number): { project: ProjectSnapshot; rightId: string } | null {
  const c = p.clips.find((x) => x.id === id);
  if (!c || t <= c.start + MIN_CLIP / 2 || t >= c.start + c.duration - MIN_CLIP / 2) return null;
  const local = t - c.start;
  const { transitionOut, ...rest } = c;
  const left = { ...rest, duration: local } as Clip;
  const right = {
    ...c,
    id: newId(10),
    start: t,
    duration: c.duration - local,
    trimIn: c.kind === "video" || c.kind === "audio" ? c.trimIn + local * speedOf(c) : c.trimIn,
    animateIn: undefined,
  } as Clip;
  if (c.animateOut) (left as Clip).animateOut = undefined;
  const clips: Clip[] = [];
  for (const x of p.clips) {
    if (x.id === id) clips.push(left, right);
    else clips.push(x);
  }
  void transitionOut;
  return { project: { ...p, clips }, rightId: right.id };
}

/** Change playback speed; the clip gets shorter or longer on the timeline. */
export function setSpeed(p: ProjectSnapshot, id: string, speed: number): ProjectSnapshot {
  const c = p.clips.find((x) => x.id === id);
  if (!c || (c.kind !== "video" && c.kind !== "audio")) return p;
  const old = speedOf(c);
  const sourceLen = c.duration * old;
  let duration = Math.max(MIN_CLIP, sourceLen / speed);
  // Faster fits anywhere; slower may run into the next clip on the track.
  const next = p.clips
    .filter((x) => x.trackId === c.trackId && x.id !== c.id && x.start >= c.start + c.duration - 1e-6)
    .reduce((m, x) => Math.min(m, x.start), Infinity);
  let clips = p.clips;
  if (c.start + duration > next) {
    const push = c.start + duration - next;
    clips = clips.map((x) => (x.trackId === c.trackId && x.id !== c.id && x.start >= c.start + c.duration - 1e-6 ? ({ ...x, start: x.start + push } as Clip) : x));
  }
  duration = Math.max(MIN_CLIP, duration);
  return { ...p, clips: clips.map((x) => (x.id === id ? ({ ...x, speed: speed === 1 ? undefined : speed, duration } as Clip) : x)) };
}

/** The clip whose start touches this clip's end on the same track (web findAdjacentNext). */
export function findAdjacentNext(p: ProjectSnapshot, id: string): Clip | null {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return null;
  const end = c.start + c.duration;
  return p.clips.find((x) => x.id !== c.id && x.trackId === c.trackId && Math.abs(x.start - end) < 0.001) ?? null;
}

export function maxTransitionFor(a: Clip, b: Clip): number {
  return Math.min(MAX_TRANSITION_DURATION, a.duration * 0.5, b.duration * 0.5);
}

/** Set or clear the transition from a clip into the one right after it. */
export function setTransition(p: ProjectSnapshot, id: string, transition: Transition | null): ProjectSnapshot {
  return {
    ...p,
    clips: p.clips.map((c) => {
      if (c.id !== id) return c;
      const { transitionOut: _old, ...rest } = c;
      void _old;
      return (transition ? { ...rest, transitionOut: transition } : rest) as Clip;
    }),
  };
}

/** Close the gap a deleted video leaves on the main track, like a phone editor does. */
export function deleteAndClose(p: ProjectSnapshot, id: string): ProjectSnapshot {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return p;
  const clips = p.clips.filter((x) => x.id !== id);
  if (c.kind !== "video") return { ...p, clips };
  return {
    ...p,
    clips: clips.map((x) => (x.trackId === c.trackId && x.start >= c.start + c.duration - 1e-6 ? ({ ...x, start: x.start - c.duration } as Clip) : x)),
  };
}

export function setTrackMuted(p: ProjectSnapshot, trackId: string, muted: boolean): ProjectSnapshot {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)) };
}

/** Rows for the timeline, top row first: the front-most track at the top, sounds at the bottom. */
export function timelineRows(p: ProjectSnapshot): Track[] {
  const used = p.tracks.filter((t) => p.clips.some((c) => c.trackId === t.id));
  const visual = used.filter((t) => t.kind !== "audio").reverse();
  const audio = used.filter((t) => t.kind === "audio");
  return [...visual, ...audio];
}

export function fmtTime(s: number): string {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  const sec = Math.floor(v % 60);
  const tenth = Math.floor((v * 10) % 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${tenth}`;
}

/** Copy a clip to the next free spot after it on its own track. */
export function duplicateInTime(p: ProjectSnapshot, id: string): { project: ProjectSnapshot; clipId: string } | null {
  const c = p.clips.find((x) => x.id === id);
  if (!c) return null;
  const start = findFreeStart(p.clips, c.trackId, c.start + c.duration, c.duration);
  const copy = { ...c, id: newId(10), start } as Clip;
  return { project: { ...p, clips: [...p.clips, copy] }, clipId: copy.id };
}

/** Show a new picture, text or shape from the playhead for a few seconds, in a video. */
export function retimeToPlayhead(p: ProjectSnapshot, id: string, at: number, seconds = 3): ProjectSnapshot {
  const end = timelineEnd({ ...p, clips: p.clips.filter((c) => c.id !== id) });
  const start = Math.max(0, Math.min(at, Math.max(0, end - 0.5)));
  const duration = end - start >= 1 ? Math.min(seconds, end - start) : seconds;
  return { ...p, clips: p.clips.map((c) => (c.id === id ? ({ ...c, start, duration } as Clip) : c)) };
}
