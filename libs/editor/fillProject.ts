import type { GradientFill } from "./gradientFill";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";
import { getPages, pageAt } from "./pages";

export function fillDesignLayers(project: ProjectSnapshot, ids: readonly string[], gradient: GradientFill | null): ProjectSnapshot {
  const selected = new Set(ids);
  const clips = project.clips.map(clip => selected.has(clip.id) && !clip.locked &&
    (clip.kind === "text" || (clip.kind === "shape" && !clip.chart && !clip.table && !clip.qr)) ? { ...clip, gradient } : clip);
  return clips.some((clip, index) => clip !== project.clips[index]) ? { ...project, clips } : project;
}

export function putGradientBackground(project: ProjectSnapshot, time: number, gradient: GradientFill, makeId: () => string) {
  return putPageBackground(project, time, "#000000", gradient, makeId);
}

export function solidDesignLayers(project: ProjectSnapshot, ids: readonly string[], colour: string): ProjectSnapshot {
  if (!/^#[\da-f]{6}$/i.test(colour)) return project;
  const chosen = new Set(ids);
  const clips = project.clips.map(clip => {
    if (!chosen.has(clip.id) || clip.locked) return clip;
    if (clip.kind === "text") return { ...clip, color: colour, gradient: null, ...(clip.hollow && clip.stroke ? { stroke: { ...clip.stroke, color: colour } } : {}) };
    if (clip.kind === "shape" && !clip.chart && !clip.table && !clip.qr) return { ...clip, fill: colour, gradient: null,
      ...((clip.symbol || clip.connector || clip.shape === "line" || clip.shape === "arrow") && clip.stroke ? { stroke: { ...clip.stroke, color: colour } } : {}) };
    return clip;
  });
  return clips.some((clip, index) => clip !== project.clips[index]) ? { ...project, clips } : project;
}

export function putSolidBackground(project: ProjectSnapshot, time: number, colour: string, makeId: () => string) {
  return /^#[\da-f]{6}$/i.test(colour) ? putPageBackground(project, time, colour, null, makeId) : null;
}

export function removePageBackground(project: ProjectSnapshot, time: number): ProjectSnapshot {
  const page = pageAt(getPages(project.settings, project.clips), time);
  const removed = project.clips.filter(clip => clip.isPageBackground && !clip.locked &&
    Math.abs(clip.start - page.start) < 0.001 && Math.abs(clip.duration - (page.end - page.start)) < 0.001);
  if (!removed.length) return project;
  const ids = new Set(removed.map(clip => clip.id)), tracks = new Set(removed.map(clip => clip.trackId));
  const clips = project.clips.filter(clip => !ids.has(clip.id));
  return { ...project, clips, tracks: project.tracks.filter(track => !tracks.has(track.id) || clips.some(clip => clip.trackId === track.id)) };
}

function putPageBackground(project: ProjectSnapshot, time: number, fill: string, gradient: GradientFill | null, makeId: () => string) {
  const page = pageAt(getPages(project.settings, project.clips), time);
  const backgrounds = project.clips.filter(c => c.isPageBackground && Math.abs(c.start - page.start) < 0.001 && Math.abs(c.duration - (page.end - page.start)) < 0.001);
  if (backgrounds.some(clip => clip.locked)) return null;
  const existing = backgrounds.length === 1 && backgrounds[0].kind === "shape" ? backgrounds[0] : undefined;
  if (existing) return { project: { ...project, clips: project.clips.map(c => c.id === existing.id ? { ...c, fill, gradient } as ShapeClip : c) }, id: existing.id };
  project = removePageBackground(project, time);
  const track: Track = { id: makeId(), kind: "video", name: "Page background", muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "rect", start: page.start, duration: page.end - page.start,
    trimIn: 0, w: 1, h: 1, fill, stroke: null, gradient, isPageBackground: true };
  return { project: { ...project, tracks: [track, ...project.tracks], clips: [...project.clips, clip] }, id: clip.id };
}
