import { graphicFontCss, validGraphicFont } from "./graphicFonts";
import { pageAt, getPages } from "./pages";
import { replaceDesignMedia } from "./replaceMedia";
import { readableTableInk } from "./tableColourScale";
import { groupedSelection } from "./designGroups";
import type { Clip, MediaClip, ProjectSnapshot, ShapeClip, TextClip, Track } from "./types";
export const MOCKUP_TEMPLATES = [
  { id: "phone", name: "Phone", width: 360, height: 740, radius: 48, body: "#111827", screen: [18, 24, 324, 692, 32] },
  { id: "tablet", name: "Tablet", width: 760, height: 1020, radius: 40, body: "#111827", screen: [24, 40, 712, 940, 18] },
  { id: "laptop", name: "Laptop", width: 1100, height: 740, radius: 24, body: "#111827", screen: [50, 30, 1000, 620, 10] },
  { id: "browser", name: "Browser window", width: 1100, height: 760, radius: 22, body: "#111827", screen: [14, 78, 1072, 668, 8] },
  { id: "poster", name: "Poster frame", width: 800, height: 1100, radius: 4, body: "#ffffff", screen: [40, 40, 720, 1020, 0] },
  { id: "instant", name: "Instant photo", width: 800, height: 1000, radius: 10, body: "#fff7ed", screen: [40, 40, 720, 780, 0] },
] as const;
export type MockupTemplateId = typeof MOCKUP_TEMPLATES[number]["id"];
export interface MockupOptions { body: string; edge: string; caption: string; size?: number; rotation?: number; screen?: string; fit?: "fill" | "fit"; fontFamily?: string; photo?: { clipId: string; mediaId: string; width: number; height: number } }
export function selectedMockupPhoto(project: ProjectSnapshot, ids: readonly string[], time: number): MediaClip | null {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const photos = project.clips.filter((clip): clip is MediaClip => clip.kind === "image" && chosen.has(clip.id) && !clip.hidden && !clip.locked && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
  return photos.length === 1 ? photos[0] : null;
}
export function putMockupTemplate(project: ProjectSnapshot, time: number, id: MockupTemplateId, options: MockupOptions, makeId: () => string) {
  const preset = MOCKUP_TEMPLATES.find(preset => preset.id === id);
  if (!preset || ![options.body, options.edge].every(colour => /^#[a-f\d]{6}$/i.test(colour)) || options.caption.length > 80) throw new Error("Use valid frame colours and a caption up to 80 characters");
  if (options.screen !== undefined && !/^#[a-f\d]{6}$/i.test(options.screen) || options.fit !== undefined && !["fill", "fit"].includes(options.fit) || !validGraphicFont(options.fontFamily)) throw new Error("Choose valid screen, photo fit and caption font options");
  const size = options.size ?? 0.8, rotation = options.rotation ?? 0;
  if (!Number.isFinite(size) || size < 0.2 || size > 0.95 || !Number.isFinite(rotation) || rotation < -180 || rotation > 180) throw new Error("Choose a mockup size from 20 to 95 percent and rotation from -180 to 180 degrees");
  const radians = rotation * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
  const source = options.photo ? project.clips.find((clip): clip is MediaClip => clip.id === options.photo!.clipId && clip.kind === "image") : undefined;
  if (options.photo && (!source || source.locked || source.hidden || source.mediaId !== options.photo.mediaId || time < source.start || time >= source.start + source.duration || project.tracks.find(track => track.id === source.trackId)?.hidden)) throw new Error("Choose an unlocked visible photo on the current page");
  if (options.photo && (![options.photo.width, options.photo.height].every(value => Number.isFinite(value) && value > 0))) throw new Error("The photo dimensions are unavailable. Insert an empty screen instead");
  const W = project.settings.width, H = project.settings.height, scale = Math.min(W * size / (Math.abs(cosine) * preset.width + Math.abs(sine) * preset.height), H * size / (Math.abs(sine) * preset.width + Math.abs(cosine) * preset.height)), x0 = (W - preset.width * scale) / 2, y0 = (H - preset.height * scale) / 2;
  const page = pageAt(getPages(project.settings, project.clips), time), groupId = makeId(), tracks: Track[] = [], clips: Clip[] = [], timing = { start: page.start, duration: page.end - page.start, trimIn: 0 };
  const shape = (name: string, x: number, y: number, width: number, height: number, fill: string, radius = 0, ellipse = false) => {
    const track: Track = { id: makeId(), kind: "video", name, muted: false, hidden: false };
    const clip: ShapeClip = { ...timing, id: makeId(), trackId: track.id, groupId, kind: "shape", shape: ellipse ? "ellipse" : "rect", w: width * scale / W, h: height * scale / H, fill, stroke: null, radius: radius * scale / H * 1080, transform: { x: (x0 + (x + width / 2) * scale) / W, y: (y0 + (y + height / 2) * scale) / H, scale: 1, rotation: 0 } };
    tracks.push(track); clips.push(clip); return clip;
  };
  const bodyHeight = id === "laptop" ? 680 : preset.height;
  const body = shape(preset.name + " body", 0, 0, preset.width, bodyHeight, options.body, preset.radius);
  body.stroke = { color: options.edge, width: 2 }; body.shadow = { color: "#000000", opacity: 0.25, blur: 24, offsetX: 0, offsetY: 12 };
  const [sx, sy, sw, sh, radius] = preset.screen;
  let photoWidth: number = sw, photoHeight: number = sh;
  const contain = options.fit === "fit" && !!source && !!options.photo;
  if (contain && source && options.photo) {
    const crop = source.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const aspect = options.photo.width * Math.max(0.02, 1 - crop.left - crop.right) / (options.photo.height * Math.max(0.02, 1 - crop.top - crop.bottom));
    photoWidth = Math.min(sw, sh * aspect); photoHeight = photoWidth / aspect;
    shape(preset.name + " screen background", sx, sy, sw, sh, options.screen ?? "#cbd5e1", radius);
  }
  const screen = shape(preset.name + " screen", sx + (sw - photoWidth) / 2, sy + (sh - photoHeight) / 2, photoWidth, photoHeight, options.screen ?? "#cbd5e1", contain ? 0 : radius); screen.photoFrame = true;
  if (id === "phone") { shape("Phone notch", 126, 24, 108, 23, options.body, 11); shape("Phone home indicator", 120, 703, 120, 7, options.edge, 4); }
  if (id === "tablet") { shape("Tablet camera", 374, 14, 12, 12, options.edge, 0, true); shape("Tablet home button", 370, 989, 20, 20, options.edge, 0, true); }
  if (id === "laptop") { shape("Laptop base", 0, 670, 1100, 54, options.body, 15); shape("Laptop hinge", 50, 654, 1000, 16, options.edge, 4); shape("Laptop trackpad", 440, 680, 220, 12, options.edge, 6); }
  if (id === "browser") { ["#fb7185", "#fbbf24", "#34d399"].forEach((colour, index) => shape("Browser control", 27 + index * 26, 32, 16, 16, colour, 0, true)); shape("Browser address field", 130, 24, 840, 32, options.edge, 8); }
  if (options.caption.trim() && (id === "browser" || id === "instant")) {
    const track: Track = { id: makeId(), kind: "text", name: "Mockup caption", muted: false, hidden: false };
    const text: TextClip = { ...timing, id: makeId(), trackId: track.id, groupId, kind: "text", text: options.caption.trim(), x: (x0 + (id === "browser" ? 550 : 400) * scale) / W, y: (y0 + (id === "browser" ? 40 : 910) * scale) / H, align: "centre", fontFamily: graphicFontCss(options.fontFamily), fontSize: Math.max(6, (id === "browser" ? 18 : 36) * scale / H * 1080), fontWeight: 500, color: readableTableInk(id === "browser" ? options.edge : options.body), lineHeight: 1.2, maxWidth: (id === "browser" ? 780 : 680) * scale / W, maxHeight: (id === "browser" ? 28 : 100) * scale / H };
    tracks.push(track); clips.push(text);
  }
  let next: ProjectSnapshot = { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] };
  if (source && options.photo) {
    next = replaceDesignMedia(next, screen.id, { id: source.mediaId, kind: "image", width: options.photo.width, height: options.photo.height });
    next = { ...next, clips: next.clips.map(clip => {
      if (clip.id !== screen.id || clip.kind !== "image") return clip;
      const crop = contain ? source.crop ?? { left: 0, right: 0, top: 0, bottom: 0 } : clip.crop ?? { left: 0, right: 0, top: 0, bottom: 0 }, original = source.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
      const horizontal = crop.left + crop.right, vertical = crop.top + crop.bottom, focalX = (original.left + 1 - original.right) / 2, focalY = (original.top + 1 - original.bottom) / 2;
      const left = Math.max(0, Math.min(horizontal, focalX - (1 - horizontal) / 2)), top = Math.max(0, Math.min(vertical, focalY - (1 - vertical) / 2));
      const aspect = options.photo!.width * (1 - horizontal) / (options.photo!.height * (1 - vertical));
      if (Math.abs(aspect / (photoWidth / photoHeight) - 1) > 0.001) throw new Error("This photo is too wide or tall for the screen. Choose Fit photo, another mockup or an empty screen");
      return { ...clip, crop: contain ? { ...original } : { left, right: horizontal - left, top, bottom: vertical - top }, effects: source.effects ? { ...source.effects, ...(source.effects.duotone ? { duotone: { ...source.effects.duotone } } : {}) } : undefined, href: source.href, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...clip.transform, opacity: source.transform?.opacity, flipH: source.transform?.flipH, flipV: source.transform?.flipV } };
    }) };
  }
  if (rotation) next = { ...next, clips: next.clips.map(clip => {
    if (clip.groupId !== groupId || clip.kind === "audio") return clip;
    const transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...clip.transform };
    const dx = ((clip.kind === "text" ? clip.x : transform.x) - 0.5) * W, dy = ((clip.kind === "text" ? clip.y : transform.y) - 0.5) * H;
    const x = 0.5 + (dx * cosine - dy * sine) / W, y = 0.5 + (dx * sine + dy * cosine) / H;
    if (clip.kind === "text") return { ...clip, x, y, transform: { ...transform, rotation: transform.rotation + rotation } };
    return { ...clip, transform: { ...transform, x, y, rotation: transform.rotation + rotation } };
  }) };
  if (next.tracks.length > 200 || next.clips.length > 10000 || JSON.stringify(next).length > 6 * 1024 * 1024) throw new Error("This mockup exceeds the design’s layer or size limits");
  return { project: next, id: screen.id };
}
