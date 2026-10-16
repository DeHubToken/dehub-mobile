import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";

export interface SymbolPart { points?: number[][]; closed?: boolean; ellipse?: number[] }
export interface VectorSymbol { id: string; label: string; category: string; tags: string; parts: SymbolPart[] }

function poly(points: number[][], closed = false): SymbolPart { return { points, closed }; }
function oval(cx: number, cy: number, rx: number, ry = rx): SymbolPart { return { ellipse: [cx, cy, rx, ry] }; }

export const VECTOR_SYMBOLS: VectorSymbol[] = [
  { id: "check", label: "Check", category: "essentials", tags: "tick done complete success", parts: [poly([[3, 12], [9, 18], [21, 5]])] },
  { id: "plus", label: "Plus", category: "essentials", tags: "add positive", parts: [poly([[12, 3], [12, 21]]), poly([[3, 12], [21, 12]])] },
  { id: "close", label: "Close", category: "essentials", tags: "cross x cancel", parts: [poly([[4, 4], [20, 20]]), poly([[20, 4], [4, 20]])] },
  { id: "check-circle", label: "Checked circle", category: "essentials", tags: "success done complete", parts: [oval(12, 12, 10), poly([[6, 12], [10, 16], [18, 8]])] },
  { id: "warning", label: "Warning", category: "essentials", tags: "alert caution danger", parts: [poly([[12, 2], [23, 21], [1, 21]], true), poly([[12, 8], [12, 14]]), oval(12, 18, 0.6)] },
  { id: "information", label: "Information", category: "essentials", tags: "info help notice", parts: [oval(12, 12, 10), oval(12, 7, 0.6), poly([[10, 11], [12, 11], [12, 18]]), poly([[9, 18], [15, 18]])] },
  { id: "search", label: "Search", category: "essentials", tags: "find magnify", parts: [oval(10, 10, 7), poly([[15, 15], [22, 22]])] },
  { id: "target", label: "Target", category: "essentials", tags: "goal focus bullseye", parts: [oval(12, 12, 10), oval(12, 12, 6), oval(12, 12, 2)] },
  { id: "chat", label: "Chat bubble", category: "communication", tags: "message comment conversation", parts: [poly([[2, 3], [22, 3], [22, 17], [10, 17], [4, 22], [4, 17], [2, 17]], true), poly([[6, 8], [18, 8]]), poly([[6, 12], [14, 12]])] },
  { id: "mail", label: "Envelope", category: "communication", tags: "email letter inbox", parts: [poly([[2, 4], [22, 4], [22, 20], [2, 20]], true), poly([[2, 5], [12, 13], [22, 5]])] },
  { id: "send", label: "Paper plane", category: "communication", tags: "send message fly", parts: [poly([[2, 10], [22, 2], [14, 22], [10, 14]], true), poly([[10, 14], [22, 2]])] },
  { id: "location", label: "Location pin", category: "communication", tags: "map place venue address", parts: [oval(12, 9, 7), poly([[6, 13], [12, 23], [18, 13]]), oval(12, 9, 2.5)] },
  { id: "globe", label: "Globe", category: "communication", tags: "world earth international web", parts: [oval(12, 12, 10), oval(12, 12, 4, 10), poly([[2, 12], [22, 12]]), poly([[4, 6], [20, 6]]), poly([[4, 18], [20, 18]])] },
  { id: "megaphone", label: "Megaphone", category: "communication", tags: "announce marketing loudspeaker", parts: [poly([[3, 9], [9, 9], [20, 3], [20, 20], [9, 14], [3, 14]], true), poly([[7, 14], [9, 22], [13, 22], [11, 15]])] },
  { id: "play", label: "Play", category: "media", tags: "video start triangle", parts: [poly([[5, 2], [22, 12], [5, 22]], true)] },
  { id: "pause", label: "Pause", category: "media", tags: "stop hold video", parts: [poly([[4, 3], [9, 3], [9, 21], [4, 21]], true), poly([[15, 3], [20, 3], [20, 21], [15, 21]], true)] },
  { id: "music", label: "Music note", category: "media", tags: "audio song sound", parts: [poly([[8, 18], [8, 5], [21, 2], [21, 15]]), oval(5, 19, 3, 2), oval(18, 16, 3, 2), poly([[8, 8], [21, 5]])] },
  { id: "camera", label: "Camera", category: "media", tags: "photo photography picture", parts: [poly([[2, 7], [7, 7], [9, 3], [15, 3], [17, 7], [22, 7], [22, 21], [2, 21]], true), oval(12, 14, 5)] },
  { id: "video", label: "Video camera", category: "media", tags: "film movie record", parts: [poly([[2, 5], [16, 5], [16, 20], [2, 20]], true), poly([[16, 10], [23, 6], [23, 20], [16, 16]])] },
  { id: "image", label: "Picture", category: "media", tags: "photo landscape gallery", parts: [poly([[2, 2], [22, 2], [22, 22], [2, 22]], true), oval(8, 8, 2), poly([[2, 20], [9, 13], [13, 17], [17, 11], [22, 16]])] },
  { id: "headphones", label: "Headphones", category: "media", tags: "audio music podcast listening", parts: [poly([[3, 15], [3, 7], [7, 2], [17, 2], [21, 7], [21, 15]]), poly([[2, 12], [7, 12], [7, 22], [2, 22]], true), poly([[17, 12], [22, 12], [22, 22], [17, 22]], true)] },
  { id: "gamepad", label: "Game controller", category: "media", tags: "gaming console play", parts: [poly([[5, 6], [19, 6], [23, 20], [17, 20], [14, 15], [10, 15], [7, 20], [1, 20]], true), poly([[7, 8], [7, 13]]), poly([[4.5, 10.5], [9.5, 10.5]]), oval(17, 9, 0.7), oval(20, 12, 0.7)] },
  { id: "person", label: "Person", category: "people", tags: "user profile account human", parts: [oval(12, 6, 4), poly([[3, 23], [3, 17], [7, 13], [17, 13], [21, 17], [21, 23]])] },
  { id: "team", label: "Team", category: "people", tags: "users group community people", parts: [oval(8, 7, 3.5), oval(18, 8, 3), poly([[1, 22], [1, 17], [5, 13], [11, 13], [15, 17], [15, 22]]), poly([[16, 14], [21, 14], [24, 18], [24, 22]])] },
  { id: "heart-health", label: "Care", category: "people", tags: "health wellbeing pulse heartbeat", parts: [poly([[1, 12], [6, 12], [9, 4], [14, 21], [17, 12], [23, 12]])] },
  { id: "crown", label: "Crown", category: "objects", tags: "royal king queen premium", parts: [poly([[2, 4], [7, 11], [12, 2], [17, 11], [22, 4], [20, 20], [4, 20]], true), poly([[4, 16], [20, 16]])] },
  { id: "trophy", label: "Trophy", category: "objects", tags: "award winner cup sport", parts: [poly([[6, 2], [18, 2], [18, 9], [15, 14], [9, 14], [6, 9]], true), poly([[6, 4], [1, 4], [1, 9], [7, 12]]), poly([[18, 4], [23, 4], [23, 9], [17, 12]]), poly([[12, 14], [12, 21]]), poly([[7, 22], [17, 22]])] },
  { id: "gift", label: "Gift", category: "objects", tags: "present birthday reward", parts: [poly([[2, 8], [22, 8], [22, 12], [2, 12]], true), poly([[4, 12], [4, 23], [20, 23], [20, 12]]), poly([[12, 8], [12, 23]]), oval(8, 4, 4, 3), oval(16, 4, 4, 3)] },
  { id: "calendar", label: "Calendar", category: "objects", tags: "date event schedule", parts: [poly([[2, 5], [22, 5], [22, 23], [2, 23]], true), poly([[2, 10], [22, 10]]), poly([[7, 1], [7, 7]]), poly([[17, 1], [17, 7]]), poly([[6, 15], [10, 15]]), poly([[14, 15], [18, 15]]), poly([[6, 19], [10, 19]])] },
  { id: "clock", label: "Clock", category: "objects", tags: "time hour watch", parts: [oval(12, 12, 10), poly([[12, 5], [12, 12], [17, 15]])] },
  { id: "home", label: "Home", category: "objects", tags: "house building address", parts: [poly([[1, 11], [12, 1], [23, 11]]), poly([[4, 9], [4, 23], [20, 23], [20, 9]]), poly([[9, 23], [9, 15], [15, 15], [15, 23]])] },
  { id: "lock", label: "Lock", category: "objects", tags: "secure privacy protected", parts: [poly([[5, 10], [5, 5], [8, 1], [16, 1], [19, 5], [19, 10]]), poly([[3, 10], [21, 10], [21, 23], [3, 23]], true), oval(12, 15, 1.5), poly([[12, 16.5], [12, 20]])] },
  { id: "shield", label: "Shield", category: "objects", tags: "security protection trust", parts: [poly([[12, 1], [22, 5], [21, 15], [17, 20], [12, 23], [7, 20], [3, 15], [2, 5]], true), poly([[7, 12], [11, 16], [18, 8]])] },
  { id: "briefcase", label: "Briefcase", category: "objects", tags: "work business office", parts: [poly([[2, 7], [22, 7], [22, 22], [2, 22]], true), poly([[7, 7], [7, 2], [17, 2], [17, 7]]), poly([[2, 13], [22, 13]]), poly([[10, 11], [14, 11], [14, 15], [10, 15]], true)] },
  { id: "ticket", label: "Ticket", category: "objects", tags: "event pass admission concert", parts: [poly([[1, 5], [23, 5], [23, 9], [20, 12], [23, 15], [23, 19], [1, 19], [1, 15], [4, 12], [1, 9]], true), poly([[15, 7], [15, 10]]), poly([[15, 14], [15, 17]])] },
  { id: "bolt", label: "Lightning", category: "nature", tags: "energy flash electric power", parts: [poly([[14, 1], [3, 14], [11, 14], [9, 23], [22, 9], [14, 9]], true)] },
  { id: "sun", label: "Sun", category: "nature", tags: "day summer weather light", parts: [oval(12, 12, 5), ...Array.from({ length: 8 }, (_, index) => { const angle = index * Math.PI / 4; return poly([[12 + Math.cos(angle) * 8, 12 + Math.sin(angle) * 8], [12 + Math.cos(angle) * 11, 12 + Math.sin(angle) * 11]]); })] },
  { id: "cloud", label: "Cloud", category: "nature", tags: "weather sky", parts: [poly([[4, 20], [1, 17], [1, 12], [5, 9], [8, 9], [9, 4], [15, 2], [20, 6], [20, 11], [23, 14], [23, 18], [20, 20]], true)] },
  { id: "mountains", label: "Mountains", category: "nature", tags: "landscape outdoors hike adventure", parts: [poly([[1, 22], [9, 3], [18, 22]], true), poly([[13, 11], [17, 3], [24, 22], [18, 22]]), poly([[6, 10], [9, 12], [12, 10]])] },
  { id: "flower", label: "Flower", category: "nature", tags: "plant floral spring garden", parts: [oval(12, 12, 3), oval(12, 5, 3, 4), oval(12, 19, 3, 4), oval(5, 12, 4, 3), oval(19, 12, 4, 3)] },
];

interface SymbolContext {
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
}

export function vectorSymbolPath(ctx: SymbolContext, width: number, height: number, id: string): void {
  ctx.beginPath();
  const symbol = VECTOR_SYMBOLS.find(item => item.id === id);
  if (!symbol) return;
  const x = (value: number) => (value / 24 - 0.5) * width, y = (value: number) => (value / 24 - 0.5) * height;
  for (const part of symbol.parts) {
    if (part.ellipse) {
      const [cx, cy, rx, ry] = part.ellipse;
      ctx.moveTo(x(cx + rx), y(cy)); ctx.ellipse(x(cx), y(cy), rx / 24 * width, ry / 24 * height, 0, 0, Math.PI * 2); ctx.closePath();
    } else if (part.points?.length) {
      ctx.moveTo(x(part.points[0][0]), y(part.points[0][1]));
      for (const point of part.points.slice(1)) ctx.lineTo(x(point[0]), y(point[1]));
      if (part.closed) ctx.closePath();
    }
  }
}

export function vectorSymbolSvg(id: string): string {
  return (VECTOR_SYMBOLS.find(symbol => symbol.id === id)?.parts ?? []).map(part => {
    if (part.ellipse) { const [x, y, rx, ry] = part.ellipse; return `M ${x + rx} ${y} A ${rx} ${ry} 0 1 0 ${x - rx} ${y} A ${rx} ${ry} 0 1 0 ${x + rx} ${y} Z`; }
    return (part.points ?? []).map((point, index) => `${index ? "L" : "M"} ${point.join(" ")}`).join(" ") + (part.closed ? " Z" : "");
  }).join(" ");
}

export function putVectorSymbol(project: ProjectSnapshot, time: number, symbol: string, colour: string, weight: number, makeId: () => string, selectedId?: string | null) {
  const preset = VECTOR_SYMBOLS.find(item => item.id === symbol);
  if (!preset || !/^#[\da-f]{6}$/i.test(colour) || !Number.isFinite(weight) || weight < 1 || weight > 40) return null;
  const existing = project.clips.find(clip => clip.id === selectedId && clip.kind === "shape" && clip.symbol);
  if (existing?.locked) return null;
  if (existing?.kind === "shape") return { project: { ...project, clips: project.clips.map(clip => clip.id === existing.id ? { ...existing, symbol, label: existing.label === VECTOR_SYMBOLS.find(item => item.id === existing.symbol)?.label ? preset.label : existing.label, stroke: { ...existing.stroke, color: colour, width: weight } } as ShapeClip : clip) }, id: existing.id };
  const page = pageAt(getPages(project.settings, project.clips), time), size = Math.min(project.settings.width, project.settings.height) * 0.22;
  const track: Track = { id: makeId(), kind: "video", name: preset.label, muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "rect", label: preset.label, symbol, start: page.start, duration: page.end - page.start, trimIn: 0, w: size / project.settings.width, h: size / project.settings.height, fill: null, stroke: { color: colour, width: weight } };
  return { project: { ...project, tracks: [...project.tracks, track], clips: [...project.clips, clip] }, id: clip.id };
}
