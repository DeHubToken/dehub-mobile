import { GOOGLE_FONTS } from "./fontCatalogue";
import { getPages, pageAt } from "./pages";
import type { Clip, ProjectSnapshot, TextClip, Track } from "./types";

export const TEXT_COMPOSITIONS = [
  { id: "editorial", label: "Editorial", heading: "Playfair Display", body: "Inter", weight: 700, align: "left", layout: "heading" },
  { id: "poster", label: "Poster", heading: "Bebas Neue", body: "DM Sans", weight: 400, align: "centre", layout: "heading" },
  { id: "minimal", label: "Minimal", heading: "Manrope", body: "Lora", weight: 700, align: "centre", layout: "heading" },
  { id: "handwritten", label: "Handwritten", heading: "Caveat", body: "Montserrat", weight: 600, align: "centre", layout: "heading" },
  { id: "literary", label: "Literary", heading: "Cormorant Garamond", body: "Inter", weight: 500, align: "left", layout: "heading" },
  { id: "modern", label: "Modern", heading: "Space Grotesk", body: "DM Sans", weight: 700, align: "left", layout: "heading" },
  { id: "quote", label: "Quotation", heading: "Playfair Display", body: "Inter", weight: 500, align: "left", layout: "quote" },
  { id: "lowerthird", label: "Lower third", heading: "Manrope", body: "Inter", weight: 700, align: "left", layout: "lowerthird" },
] as const;
export type TextCompositionId = typeof TEXT_COMPOSITIONS[number]["id"];

/** Editable font pairings insert as ordinary grouped text and vector layers. */
export function putTextComposition(project: ProjectSnapshot, time: number, id: TextCompositionId,
  content: { title: string; subtitle: string; eyebrow: string; colour: string; accent: string; headingFont?: string | null; bodyFont?: string | null }, makeId: () => string) {
  const preset = TEXT_COMPOSITIONS.find(value => value.id === id);
  if (!preset || !content.title.trim() || ![content.colour, content.accent].every(value => /^#[\da-f]{6}$/i.test(value))) return null;
  const headingFont = content.headingFont?.split(",")[0].trim().replace(/^['"]|['"]$/g, "") || preset.heading, bodyFont = content.bodyFont?.split(",")[0].trim().replace(/^['"]|['"]$/g, "") || preset.body;
  if ([headingFont, bodyFont].some(font => font.length > 500 || /[\u0000-\u001f\u007f]/.test(font))) return null;
  const page = pageAt(getPages(project.settings, project.clips), time), groupId = makeId();
  const tracks: Track[] = [], clips: Clip[] = [];
  const text = (value: string, font: string, size: number, weight: number, y: number, height: number, uppercase = false, x = preset.align === "left" ? 0.14 : 0.5, colour = content.colour) => {
    if (!value.trim()) return;
    const track: Track = { id: makeId(), kind: "text", name: value.trim().slice(0, 40), muted: false, hidden: false };
    const family = GOOGLE_FONTS.find(item => item.family === font);
    const fontWeight = family ? family.weights.reduce((best, item) => Math.abs(item - weight) < Math.abs(best - weight) ? item : best, family.weights[0]) : weight;
    const clip: TextClip = { id: makeId(), trackId: track.id, groupId, kind: "text", text: value.trim().slice(0, 2000),
      start: page.start, duration: page.end - page.start, trimIn: 0, x, y,
      align: preset.align, fontFamily: `'${font}', sans-serif`, fontSize: size, fontWeight, color: colour,
      uppercase, letterSpacing: uppercase ? 5 : 0, lineHeight: size > 80 ? 1.05 : 1.3,
      maxWidth: preset.align === "left" ? 0.72 : 0.8, maxHeight: height };
    tracks.push(track); clips.push(clip);
  };
  const accentShape = (name: string, x: number, y: number, w: number, h: number, fill: string) => {
    const track: Track = { id: makeId(), kind: "video", name, muted: false, hidden: false };
    tracks.push(track); clips.push({ id: makeId(), trackId: track.id, groupId, kind: "shape", shape: "rect", start: page.start, duration: page.end - page.start, trimIn: 0, w, h, fill, stroke: null, transform: { x, y, scale: 1, rotation: 0 } });
  };
  if (preset.layout === "lowerthird") {
    accentShape("Lower-third backdrop", 0.5, 0.78, 0.8, 0.28, "#0f172a");
    accentShape("Lower-third accent", 0.105, 0.78, 0.01, 0.28, content.accent);
    text(content.eyebrow, bodyFont, 22, 600, 0.69, 0.05, true);
    text(content.title, headingFont, 68, preset.weight, 0.77, 0.1);
    text(content.subtitle, bodyFont, 30, 400, 0.86, 0.07);
  } else if (preset.layout === "quote") {
    text("“", headingFont, 200, 700, 0.24, 0.18, false, 0.12, content.accent);
    text(content.eyebrow, bodyFont, 24, 500, 0.23, 0.06, true, 0.26);
    text(content.title, headingFont, 86, preset.weight, 0.49, 0.36);
    accentShape("Quotation accent", 0.19, 0.74, 0.1, 0.004, content.accent);
    text(content.subtitle, bodyFont, 32, 500, 0.81, 0.1);
  } else {
    accentShape("Typography accent", preset.align === "left" ? 0.19 : 0.5, 0.35, 0.1, 0.004, content.accent);
    text(content.eyebrow, bodyFont, 27, 500, 0.28, 0.08, true);
    text(content.title, headingFont, id === "poster" ? 184 : id === "handwritten" ? 170 : 140, preset.weight, 0.5, 0.28);
    text(content.subtitle, bodyFont, 38, 400, 0.72, 0.12);
  }
  if (project.tracks.length + tracks.length > 200 || project.clips.length + clips.length > 10000 || JSON.stringify(project).length + JSON.stringify(clips).length > 6 * 1024 * 1024) return null;
  const selectedId = clips.find(clip => clip.kind === "text" && clip.text === content.title.trim().slice(0, 2000))?.id ?? clips[0].id;
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, id: selectedId };
}
