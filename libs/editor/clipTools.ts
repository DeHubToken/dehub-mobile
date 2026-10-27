/**
 * One-tap clip fixes: split a video's sound onto its own audio clip, and crop
 * away letterbox or pillarbox bars baked into the footage.
 */
import type { ClipCrop, MediaClip, ProjectSnapshot } from "./types";

const overlaps = (a: { start: number; duration: number }, b: { start: number; duration: number }) =>
  a.start < b.start + b.duration - 1e-6 && b.start < a.start + a.duration - 1e-6;

/** Copies the clip's sound to a free audio track and silences the original. */
export function detachAudio(project: ProjectSnapshot, clipId: string, makeId: () => string): { project: ProjectSnapshot; id: string } | null {
  const clip = project.clips.find((c): c is MediaClip => c.id === clipId && c.kind === "video");
  if (!clip || clip.locked) return null;
  if ((clip.audio?.volume ?? 1) <= 0) return null;
  const free = project.tracks.find(t => t.kind === "audio" && !project.clips.some(c => c.trackId === t.id && overlaps(c, clip)));
  const tracks = [...project.tracks];
  let trackId = free?.id;
  if (!trackId) {
    trackId = makeId();
    tracks.push({ id: trackId, kind: "audio", name: `Audio ${tracks.filter(t => t.kind === "audio").length + 1}`, muted: false, hidden: false });
  }
  const id = makeId();
  const audio: MediaClip = {
    id, kind: "audio", mediaId: clip.mediaId, trackId, start: clip.start, duration: clip.duration, trimIn: clip.trimIn,
    ...(clip.sourceDuration !== undefined ? { sourceDuration: clip.sourceDuration } : {}),
    ...(clip.speed !== undefined ? { speed: clip.speed } : {}),
    ...(clip.audio ? { audio: { ...clip.audio } } : {}),
    label: clip.label ? `${clip.label} audio` : undefined,
  };
  const clips = project.clips.map(c => c.id === clip.id ? { ...clip, audio: { ...clip.audio, volume: 0, envelope: undefined } } : c);
  return { project: { ...project, tracks, clips: [...clips, audio] }, id };
}

export interface FramePixels { data: ArrayLike<number>; width: number; height: number }

/** Fraction of each edge that is a solid dark bar in this frame. */
export function frameBars(frame: FramePixels, threshold = 28): ClipCrop {
  const { data, width, height } = frame;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] < threshold;
  };
  const rowDark = (y: number) => { let n = 0; for (let x = 0; x < width; x++) if (dark(x, y)) n++; return n >= width * 0.97; };
  const colDark = (x: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) if (dark(x, y)) n++; return n >= (y1 - y0) * 0.97; };
  let top = 0; while (top < height / 2 && rowDark(top)) top++;
  let bottom = 0; while (bottom < height / 2 && rowDark(height - 1 - bottom)) bottom++;
  const y0 = top, y1 = Math.max(y0 + 1, height - bottom);
  let left = 0; while (left < width / 2 && colDark(left, y0, y1)) left++;
  let right = 0; while (right < width / 2 && colDark(width - 1 - right, y0, y1)) right++;
  // A fully black frame says nothing about bars.
  if (top >= height / 2 || left >= width / 2) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left: left / width, top: top / height, right: right / width, bottom: bottom / height };
}

/** Bars present in every sampled frame, or null when there are none worth cropping. */
export function letterboxCrop(frames: FramePixels[], minimum = 0.02): ClipCrop | null {
  if (!frames.length) return null;
  const bars = frames.map(f => frameBars(f));
  const edge = (key: keyof ClipCrop) => {
    const value = Math.min(...bars.map(b => b[key]));
    return value >= minimum ? Math.min(0.45, Math.round(value * 1000) / 1000) : 0;
  };
  const crop = { left: edge("left"), top: edge("top"), right: edge("right"), bottom: edge("bottom") };
  return crop.left || crop.top || crop.right || crop.bottom ? crop : null;
}

/**
 * Copy a video onto a new top track, silent, so text and captions can sit
 * between the person and the background once that copy's background is removed.
 */
export function subjectLayer(project: ProjectSnapshot, clipId: string, makeId: () => string): { project: ProjectSnapshot; id: string } | null {
  const clip = project.clips.find((c): c is MediaClip => c.id === clipId && c.kind === "video");
  if (!clip || clip.locked) return null;
  const trackId = makeId();
  const tracks = [...project.tracks, { id: trackId, kind: "video" as const, name: "Subject", muted: true, hidden: false }];
  // Alone on its track, so a transition or a group would pull in clips it no longer sits next to.
  const { transitionOut: _transition, groupId: _group, videoMatte: _matte, ...rest } = clip;
  const id = makeId();
  const copy: MediaClip = { ...rest, id, trackId, audio: { ...clip.audio, volume: 0, envelope: undefined }, label: clip.label ? `${clip.label} subject` : undefined };
  return { project: { ...project, tracks, clips: [...project.clips, copy] }, id };
}

/** The source span a clip plays, in seconds of the original file. */
export function clipSourceSpan(clip: MediaClip): { start: number; end: number } {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  return { start: clip.trimIn, end: clip.trimIn + clip.duration * speed };
}

/** The clip pointed at a reversed copy of exactly the span it played. */
export function reversedClip(project: ProjectSnapshot, clipId: string, mediaId: string, sourceDuration: number): ProjectSnapshot | null {
  const clip = project.clips.find((c): c is MediaClip => c.id === clipId && c.kind === "video");
  if (!clip || clip.locked) return null;
  const { videoMatte: _matte, ...rest } = clip;
  const next: MediaClip = { ...rest, mediaId, trimIn: 0, sourceDuration };
  return { ...project, clips: project.clips.map(c => c.id === clipId ? next : c) };
}
