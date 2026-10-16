import { getPages, pageAt } from "./pages";
import { removePageBackground } from "./fillProject";
import { mediaCropFocus, normaliseMediaCrop } from "./mediaCrop";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, MediaClip, ProjectSnapshot, Track } from "./types";

/** Move the current page's part of a photo behind the artwork without moving other pages. */
export function setPhotoBackground(project: ProjectSnapshot, time: number, id: string, source: { width?: number; height?: number } | null, makeId: () => string) {
  const photo = project.clips.find(clip => clip.id === id);
  if (photo?.kind !== "image" || photo.locked || photo.isPageBackground) return null;
  const pages = getPages(project.settings, project.clips), page = pageAt(pages, time);
  if (photo.start >= page.end || photo.start + photo.duration <= page.start) return null;
  const backgrounds = project.clips.filter(clip => clip.isPageBackground && Math.abs(clip.start - page.start) < 0.001 && Math.abs(clip.duration - (page.end - page.start)) < 0.001);
  if (backgrounds.some(clip => clip.locked)) return null;
  const cleared = removePageBackground(project, time), outside: Clip[] = [];
  const before = page.start - photo.start, after = photo.start + photo.duration - page.end;
  if (before > 1e-6) outside.push(sliceTimelineClip(photo, 0, before, photo.id));
  if (after > 1e-6) outside.push(sliceTimelineClip(photo, page.end - photo.start, after, outside.length ? makeId() : photo.id, page.end));
  const transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: photo.transform?.opacity ?? 1, flipH: photo.transform?.flipH, flipV: photo.transform?.flipV };
  let crop: MediaClip["crop"] = null;
  if (source?.width && source.height) {
    const natural = source.width / source.height, target = project.settings.width / project.settings.height, focus = mediaCropFocus(photo);
    const x = transform.flipH ? 1 - focus.x : focus.x, y = transform.flipV ? 1 - focus.y : focus.y;
    const horizontal = natural > target ? Math.max(0, 1 - target / natural) : 0, vertical = natural < target ? Math.max(0, 1 - natural / target) : 0;
    crop = normaliseMediaCrop({ left: horizontal * x, right: horizontal * (1 - x), top: vertical * y, bottom: vertical * (1 - y) });
  }
  const track: Track = { id: makeId(), kind: "video", name: "Photo background", muted: false, hidden: false };
  const background: MediaClip = { ...photo, id: outside.length ? makeId() : photo.id, trackId: track.id, groupId: undefined, isPageBackground: true, start: page.start, duration: page.end - page.start, transform, fit: "cover", crop, frame: "rect", radius: 0, border: null, shadow: null, keyframes: undefined, animateIn: undefined, animateOut: undefined, transitionOut: undefined };
  const clips = [...cleared.clips.filter(clip => clip.id !== photo.id), ...outside, background];
  const tracks = cleared.tracks.filter(item => item.id !== photo.trackId || clips.some(clip => clip.trackId === item.id));
  if (tracks.length >= 200 || clips.length > 10000) return null;
  return { project: { ...cleared, tracks: [track, ...tracks], clips }, id: background.id };
}

/** Detach to a new foreground track so backgrounds on other pages keep their stacking. */
export function detachPhotoBackground(project: ProjectSnapshot, id: string, makeId: () => string) {
  const photo = project.clips.find(clip => clip.id === id);
  if (photo?.kind !== "image" || !photo.isPageBackground || photo.locked || project.tracks.length >= 200) return null;
  const track: Track = { id: makeId(), kind: "video", name: "Photo", muted: false, hidden: false };
  const clips = project.clips.map(clip => clip.id === id ? { ...photo, isPageBackground: undefined, trackId: track.id, groupId: undefined, fit: "contain", transform: { ...photo.transform, x: 0.5, y: 0.5, rotation: 0, scale: 0.7 } } as MediaClip : clip);
  return { project: { ...project, tracks: [...project.tracks.filter(item => item.id !== photo.trackId || clips.some(clip => clip.trackId === item.id)), track], clips }, id };
}
