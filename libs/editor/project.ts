/**
 * Editing operations on a ProjectSnapshot.
 *
 * Every function here is pure: it takes a snapshot and returns a new one. The
 * screen keeps history by holding on to the old ones. The rules mirror the web
 * editor's store (dehubweb src/store/editorStore.ts) wherever a project could
 * notice the difference — track order is draw order, text keeps its anchor in
 * x/y, media keeps its placement in `transform` — so a design made here opens
 * on the web looking the same, and the other way round.
 */
import type {
  AspectPreset,
  Clip,
  ClipTransform,
  MediaClip,
  ProjectSnapshot,
  TextClip,
  Track,
  TrackKind,
} from "./types";
import { aspectToDims, DEFAULT_SETTINGS } from "./types";

/** Seconds a new layer lasts, matching an image dropped on the web timeline. */
export const LAYER_DURATION = 5;

/**
 * The frame the photo editor shows and exports. Late enough that the web's
 * 0.3s text fade-in and the default 0.4s entrance animations have finished, so
 * the still matches what the design looks like once it has settled.
 */
export const STILL_TIME = 1;

export const TEXT_FONT_FAMILY = "Inter, ui-sans-serif, system-ui, sans-serif";

const DEFAULT_TRANSFORM: ClipTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

const ID_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

/** Short random id in the same alphabet and lengths nanoid gives the web. */
export function newId(size = 10): string {
  let out = "";
  for (let i = 0; i < size; i++) out += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return out;
}

function defaultTracks(): Track[] {
  // Same three tracks the web starts with. Later tracks draw on top.
  return [
    { id: newId(8), kind: "video", name: "Video 1", muted: false, hidden: false },
    { id: newId(8), kind: "audio", name: "Audio 1", muted: false, hidden: false },
    { id: newId(8), kind: "text", name: "Text", muted: false, hidden: false },
  ];
}

export function newProject(aspect: Exclude<AspectPreset, "custom">, title: string): ProjectSnapshot {
  const dims = aspectToDims(aspect);
  return {
    id: newId(10),
    title,
    tracks: defaultTracks(),
    clips: [],
    settings: { ...DEFAULT_SETTINGS, ...dims, aspectPreset: aspect },
    updatedAt: Date.now(),
  };
}

export function setAspect(p: ProjectSnapshot, aspect: Exclude<AspectPreset, "custom">): ProjectSnapshot {
  const dims = aspectToDims(aspect);
  return { ...p, settings: { ...p.settings, ...dims, aspectPreset: aspect } };
}

export function setBackground(p: ProjectSnapshot, background: string): ProjectSnapshot {
  return { ...p, settings: { ...p.settings, background } };
}

/** End of the last clip, so a layer added to a web timeline spans all of it. */
export function timelineEnd(p: ProjectSnapshot): number {
  return p.clips.reduce((end, c) => Math.max(end, c.start + c.duration), 0);
}

function layerDuration(p: ProjectSnapshot): number {
  return Math.max(LAYER_DURATION, timelineEnd(p));
}

function trackName(p: ProjectSnapshot, kind: TrackKind): string {
  const count = p.tracks.filter((t) => t.kind === kind).length + 1;
  if (kind === "text") return `Text ${count}`;
  return kind === "audio" ? `Audio ${count}` : `Video ${count}`;
}

/**
 * A free track of `kind` for a layer covering [0, duration), or a new one on
 * top. Each still layer sits on its own track, as on the web, because track
 * order is what decides which layer covers which.
 */
function trackForLayer(p: ProjectSnapshot, kind: TrackKind, duration: number): { tracks: Track[]; trackId: string } {
  const free = p.tracks.find(
    (t) => t.kind === kind && !p.clips.some((c) => c.trackId === t.id && c.start < duration && c.start + c.duration > 0),
  );
  if (free) return { tracks: p.tracks, trackId: free.id };
  const track: Track = { id: newId(8), kind, name: trackName(p, kind), muted: false, hidden: false };
  return { tracks: [...p.tracks, track], trackId: track.id };
}

/** A new layer always lands above every existing one. */
function topTrack(p: ProjectSnapshot, kind: TrackKind): { tracks: Track[]; trackId: string } {
  const duration = layerDuration(p);
  const { tracks, trackId } = trackForLayer(p, kind, duration);
  const idx = tracks.findIndex((t) => t.id === trackId);
  const coveredAbove = tracks.slice(idx + 1).some((t) => p.clips.some((c) => c.trackId === t.id));
  if (!coveredAbove) return { tracks, trackId };
  // A free track lower down would put the new layer under existing ones.
  const track: Track = { id: newId(8), kind, name: trackName(p, kind), muted: false, hidden: false };
  return { tracks: [...p.tracks, track], trackId: track.id };
}

export function addImage(p: ProjectSnapshot, mediaId: string): { project: ProjectSnapshot; clipId: string } {
  const { tracks, trackId } = topTrack(p, "video");
  const clip: MediaClip = {
    id: newId(10),
    trackId,
    kind: "image",
    start: 0,
    duration: layerDuration(p),
    trimIn: 0,
    mediaId,
  };
  return { project: { ...p, tracks, clips: [...p.clips, clip] }, clipId: clip.id };
}

export function addText(p: ProjectSnapshot, text: string): { project: ProjectSnapshot; clipId: string } {
  const { tracks, trackId } = topTrack(p, "text");
  const clip: TextClip = {
    id: newId(10),
    trackId,
    kind: "text",
    start: 0,
    duration: layerDuration(p),
    trimIn: 0,
    text,
    fontFamily: TEXT_FONT_FAMILY,
    fontSize: 72,
    fontWeight: 700,
    color: "#ffffff",
    align: "centre",
    x: 0.5,
    y: 0.5,
  };
  return { project: { ...p, tracks, clips: [...p.clips, clip] }, clipId: clip.id };
}

export function getClip(p: ProjectSnapshot, id: string | null): Clip | null {
  return id ? p.clips.find((c) => c.id === id) ?? null : null;
}

export function updateClip(p: ProjectSnapshot, id: string, patch: Partial<MediaClip> | Partial<TextClip>): ProjectSnapshot {
  return { ...p, clips: p.clips.map((c) => (c.id === id ? ({ ...c, ...patch } as Clip) : c)) };
}

/** Placement with defaults filled in; text reads its anchor from x/y. */
export function getTransform(clip: Clip): ClipTransform {
  const t = { ...DEFAULT_TRANSFORM, ...(clip.transform ?? {}) };
  if (clip.kind === "text") {
    t.x = clip.x;
    t.y = clip.y;
    t.scale = 1;
  }
  return t;
}

/** Same split as the web's placementPatch: text keeps x/y, media keeps transform. */
export function placementPatch(clip: Clip, patch: Partial<ClipTransform>): Partial<MediaClip> | Partial<TextClip> {
  const next = { ...getTransform(clip), ...patch };
  if (clip.kind === "text") {
    const out: Partial<TextClip> = { transform: next };
    if (patch.x !== undefined) out.x = patch.x;
    if (patch.y !== undefined) out.y = patch.y;
    return out;
  }
  return { transform: next };
}

export function removeClip(p: ProjectSnapshot, id: string): ProjectSnapshot {
  return { ...p, clips: p.clips.filter((c) => c.id !== id) };
}

export function duplicateClip(p: ProjectSnapshot, id: string): { project: ProjectSnapshot; clipId: string } | null {
  const src = getClip(p, id);
  if (!src) return null;
  const kind: TrackKind = src.kind === "text" ? "text" : src.kind === "audio" ? "audio" : "video";
  const { tracks, trackId } = topTrack(p, kind);
  const tr = getTransform(src);
  // Nudged down and right so the copy is visibly a second layer.
  const nudge = { x: Math.min(1, tr.x + 0.04), y: Math.min(1, tr.y + 0.04) };
  const copy = { ...src, id: newId(10), trackId, ...placementPatch(src, nudge) } as Clip;
  return { project: { ...p, tracks, clips: [...p.clips, copy] }, clipId: copy.id };
}

export type Arrange = "front" | "forward" | "backward" | "back";

/**
 * Move a layer up or down the stack by moving its track, which is how the web
 * orders layers. A track shared with other clips moves them too, exactly as a
 * track reorder does on the web.
 */
export function arrangeClip(p: ProjectSnapshot, id: string, dir: Arrange): ProjectSnapshot {
  const clip = getClip(p, id);
  if (!clip) return p;
  const idx = p.tracks.findIndex((t) => t.id === clip.trackId);
  if (idx < 0) return p;
  const last = p.tracks.length - 1;
  const to = dir === "front" ? last : dir === "back" ? 0 : dir === "forward" ? Math.min(last, idx + 1) : Math.max(0, idx - 1);
  if (to === idx) return p;
  const tracks = p.tracks.slice();
  const [t] = tracks.splice(idx, 1);
  tracks.splice(to, 0, t);
  return { ...p, tracks };
}

/** Visual clips on screen at time `t`, bottom layer first. */
export function visibleLayers(p: ProjectSnapshot, t: number): Clip[] {
  const hidden = new Set(p.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
  const z = (trackId: string) => p.tracks.findIndex((tr) => tr.id === trackId);
  return p.clips
    .filter((c) => c.kind !== "audio" && !hidden.has(c.trackId) && t >= c.start && t <= c.start + c.duration)
    .sort((a, b) => z(a.trackId) - z(b.trackId));
}

/** Media ids the project points at, for loading and for spotting missing files. */
export function mediaIds(p: ProjectSnapshot): string[] {
  const ids = new Set<string>();
  for (const c of p.clips) if (c.kind !== "text") ids.add(c.mediaId);
  return [...ids];
}

/** Reads a snapshot from JSON, rejecting anything that is not a project. */
export function parseProject(raw: string): ProjectSnapshot | null {
  try {
    const p = JSON.parse(raw) as ProjectSnapshot;
    if (!p || typeof p.id !== "string" || !Array.isArray(p.tracks) || !Array.isArray(p.clips) || !p.settings) return null;
    if (!(p.settings.width > 0) || !(p.settings.height > 0)) return null;
    return p;
  } catch {
    return null;
  }
}
