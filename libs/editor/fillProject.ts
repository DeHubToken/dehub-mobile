import type { GradientFill } from "./gradientFill";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";
import { getPages, pageAt } from "./pages";

export function fillDesignLayers(project: ProjectSnapshot, ids: readonly string[], gradient: GradientFill | null): ProjectSnapshot {
  const selected = new Set(ids);
  const clips = project.clips.map(clip => selected.has(clip.id) && !clip.locked &&
    (clip.kind === "text" || (clip.kind === "shape" && !clip.chart && !clip.table)) ? { ...clip, gradient } : clip);
  return clips.some((clip, index) => clip !== project.clips[index]) ? { ...project, clips } : project;
}

export function putGradientBackground(project: ProjectSnapshot, time: number, gradient: GradientFill, makeId: () => string) {
  const page = pageAt(getPages(project.settings, project.clips), time);
  const existing = project.clips.find(c => c.kind === "shape" && c.isPageBackground && Math.abs(c.start - page.start) < 0.001 && Math.abs(c.duration - (page.end - page.start)) < 0.001);
  if (existing?.locked) return null;
  if (existing) return { project: { ...project, clips: project.clips.map(c => c.id === existing.id ? { ...c, gradient } as ShapeClip : c) }, id: existing.id };
  const track: Track = { id: makeId(), kind: "video", name: "Gradient background", muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "rect", start: page.start, duration: page.end - page.start,
    trimIn: 0, w: 1, h: 1, fill: "#000000", stroke: null, gradient, isPageBackground: true };
  return { project: { ...project, tracks: [track, ...project.tracks], clips: [...project.clips, clip] }, id: clip.id };
}
