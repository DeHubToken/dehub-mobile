import { GOOGLE_FONTS } from "./fontCatalogue";
import { getPages, pageAt } from "./pages";
import type { Clip, ProjectSnapshot, TextClip, Track } from "./types";

export const TEXT_COMPOSITIONS = [
  { id: "editorial", label: "Editorial", heading: "Playfair Display", body: "Inter", weight: 700, align: "left" },
  { id: "poster", label: "Poster", heading: "Bebas Neue", body: "DM Sans", weight: 400, align: "centre" },
  { id: "minimal", label: "Minimal", heading: "Manrope", body: "Lora", weight: 700, align: "centre" },
  { id: "handwritten", label: "Handwritten", heading: "Caveat", body: "Montserrat", weight: 600, align: "centre" },
  { id: "literary", label: "Literary", heading: "Cormorant Garamond", body: "Inter", weight: 500, align: "left" },
  { id: "modern", label: "Modern", heading: "Space Grotesk", body: "DM Sans", weight: 700, align: "left" },
] as const;
export type TextCompositionId = typeof TEXT_COMPOSITIONS[number]["id"];

/** Editable font pairings insert as ordinary grouped text and vector layers. */
export function putTextComposition(project: ProjectSnapshot, time: number, id: TextCompositionId,
  content: { title: string; subtitle: string; eyebrow: string; colour: string; accent: string }, makeId: () => string) {
  const preset = TEXT_COMPOSITIONS.find(value => value.id === id);
  if (!preset || !content.title.trim() || ![content.colour, content.accent].every(value => /^#[\da-f]{6}$/i.test(value))) return null;
  const page = pageAt(getPages(project.settings, project.clips), time), groupId = makeId();
  const tracks: Track[] = [], clips: Clip[] = [];
  const text = (value: string, font: string, size: number, weight: number, y: number, height: number, uppercase = false) => {
    if (!value.trim()) return;
    const track: Track = { id: makeId(), kind: "text", name: value.trim().slice(0, 40), muted: false, hidden: false };
    const family = GOOGLE_FONTS.find(item => item.family === font);
    const fontWeight = family ? family.weights.reduce((best, item) => Math.abs(item - weight) < Math.abs(best - weight) ? item : best, family.weights[0]) : weight;
    const clip: TextClip = { id: makeId(), trackId: track.id, groupId, kind: "text", text: value.trim().slice(0, 2000),
      start: page.start, duration: page.end - page.start, trimIn: 0, x: preset.align === "left" ? 0.14 : 0.5, y,
      align: preset.align, fontFamily: `'${font}', sans-serif`, fontSize: size, fontWeight, color: content.colour,
      uppercase, letterSpacing: uppercase ? 5 : 0, lineHeight: size > 80 ? 1.05 : 1.3,
      maxWidth: preset.align === "left" ? 0.72 : 0.8, maxHeight: height };
    tracks.push(track); clips.push(clip);
  };
  const decoration: Track = { id: makeId(), kind: "video", name: "Typography accent", muted: false, hidden: false };
  tracks.push(decoration);
  clips.push({ id: makeId(), trackId: decoration.id, groupId, kind: "shape", shape: "rect", start: page.start,
    duration: page.end - page.start, trimIn: 0, w: 0.1, h: 0.004, fill: content.accent, stroke: null,
    transform: { x: preset.align === "left" ? 0.19 : 0.5, y: 0.35, scale: 1, rotation: 0 } });
  text(content.eyebrow, preset.body, 27, 500, 0.28, 0.08, true);
  text(content.title, preset.heading, id === "poster" ? 184 : id === "handwritten" ? 170 : 140, preset.weight, 0.5, 0.28);
  text(content.subtitle, preset.body, 38, 400, 0.72, 0.12);
  const selectedId = clips.find(clip => clip.kind === "text" && clip.text === content.title.trim().slice(0, 2000))?.id ?? clips[0].id;
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, id: selectedId };
}
