import { graphicFontCss, validGraphicFont } from "./graphicFonts";
import { getPages, pageAt } from "./pages";
import type { Clip, ProjectSnapshot, ShapeClip, TextClip, Track } from "./types";
export type DiagramNode = { label: string; x: number; y: number; w: number; h: number; shape: "rect" | "ellipse" | "hexagon" };
export const DIAGRAM_TEMPLATES = [
  { id: "process", name: "Four-step process", description: "A sequence of four connected steps", nodes: ["Discover", "Plan", "Create", "Deliver"].map((label, index) => ({ label, x: 0.17 + index * 0.22, y: 0.5, w: 0.16, h: 0.17, shape: "rect" as const })), edges: [[0, 1], [1, 2], [2, 3]] },
  { id: "decision", name: "Decision flow", description: "A starting point, decision and two outcomes", nodes: [{ label: "Start", x: 0.5, y: 0.18, w: 0.22, h: 0.13, shape: "ellipse" as const }, { label: "Ready to proceed?", x: 0.5, y: 0.45, w: 0.3, h: 0.2, shape: "hexagon" as const }, { label: "Make improvements", x: 0.22, y: 0.76, w: 0.27, h: 0.16, shape: "rect" as const }, { label: "Move forward", x: 0.78, y: 0.76, w: 0.27, h: 0.16, shape: "rect" as const }], edges: [[0, 1], [1, 2], [1, 3]] },
  { id: "organisation", name: "Organisation chart", description: "One lead, three teams and six responsibilities", nodes: [{ label: "Leadership", x: 0.5, y: 0.16, w: 0.25, h: 0.13, shape: "rect" as const }, ...["Product", "Growth", "Operations"].map((label, index) => ({ label, x: 0.2 + index * 0.3, y: 0.45, w: 0.22, h: 0.13, shape: "rect" as const })), ...["Design", "Engineering", "Content", "Partnerships", "Support", "Finance"].map((label, index) => ({ label, x: [0.12, 0.28, 0.42, 0.58, 0.72, 0.88][index], y: 0.76, w: 0.13, h: 0.13, shape: "rect" as const }))], edges: [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 6], [2, 7], [3, 8], [3, 9]] },
  { id: "mindmap", name: "Mind map", description: "A central idea with six connected topics", nodes: [{ label: "Central idea", x: 0.5, y: 0.5, w: 0.24, h: 0.18, shape: "ellipse" as const }, ...["Audience", "Purpose", "Resources", "Ideas", "Actions", "Outcomes"].map((label, index) => ({ label, x: 0.5 + Math.cos(index / 6 * Math.PI * 2) * 0.34, y: 0.5 + Math.sin(index / 6 * Math.PI * 2) * 0.34, w: 0.21, h: 0.14, shape: "rect" as const }))], edges: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]] },
] as const;
export type DiagramTemplateId = typeof DIAGRAM_TEMPLATES[number]["id"];
export interface DiagramContent { labels: string[]; fill: string; ink: string; accent: string; vertical: boolean; fontFamily?: string; edgeLabels?: string[] }
export function diagramDefaultEdgeLabels(id: DiagramTemplateId): string[] {
  return DIAGRAM_TEMPLATES.find(preset => preset.id === id)?.edges.map((_, index) => id === "decision" ? ["", "No", "Yes"][index] || "" : "") ?? [];
}
export function diagramNodes(id: DiagramTemplateId, labels: readonly string[], vertical = false): DiagramNode[] {
  const preset = DIAGRAM_TEMPLATES.find(preset => preset.id === id);
  if (!preset) return [];
  return preset.nodes.map((node, index) => ({ ...node, label: (labels[index] ?? node.label).trim().slice(0, 120) || node.label, ...(vertical ? { x: node.y, y: node.x, w: id === "process" ? 0.62 : node.w, h: id === "process" ? 0.12 : node.h } : {}) }));
}
export function putDiagramTemplate(project: ProjectSnapshot, time: number, id: DiagramTemplateId, content: DiagramContent, makeId: () => string) {
  const preset = DIAGRAM_TEMPLATES.find(preset => preset.id === id);
  if (!preset || ![content.fill, content.ink, content.accent].every(value => /^#[a-f\d]{6}$/i.test(value)) || content.labels.length > 10 || content.labels.some(value => value.length > 120)) throw new Error("Use valid colours and node labels up to 120 characters");
  if (content.edgeLabels && (content.edgeLabels.length > 9 || content.edgeLabels.some(label => label.length > 80))) throw new Error("Use connector labels up to 80 characters");
  if (!validGraphicFont(content.fontFamily)) throw new Error("Choose an available diagram font");
  const nodes = diagramNodes(id, content.labels, content.vertical), page = pageAt(getPages(project.settings, project.clips), time);
  const tracks: Track[] = [], clips: Clip[] = [], timing = { start: page.start, duration: page.end - page.start, trimIn: 0 };
  const W = project.settings.width, H = project.settings.height;
  const shape = (name: string, data: Omit<ShapeClip, "id" | "trackId" | "kind" | "start" | "duration" | "trimIn">) => {
    const track: Track = { id: makeId(), kind: "video", name, muted: false, hidden: false }, clip: ShapeClip = { ...data, ...timing, id: makeId(), trackId: track.id, kind: "shape" };
    tracks.push(track); clips.push(clip); return clip;
  };
  const edgeLabels = content.edgeLabels ?? diagramDefaultEdgeLabels(id);
  for (const [edgeIndex, [from, to]] of preset.edges.entries()) {
    const a = nodes[from], b = nodes[to], dx = (b.x - a.x) * W, dy = (b.y - a.y) * H;
    const boundary = (node: DiagramNode) => node.shape === "ellipse" ? 1 / Math.sqrt((dx / (node.w * W / 2)) ** 2 + (dy / (node.h * H / 2)) ** 2) : 1 / Math.max(Math.abs(dx) / (node.w * W / 2), Math.abs(dy) / (node.h * H / 2));
    const start = boundary(a), end = boundary(b), xA = a.x * W + dx * start, yA = a.y * H + dy * start, xB = b.x * W - dx * end, yB = b.y * H - dy * end;
    if (start + end >= 1) continue;
    const groupId = makeId();
    shape(`${a.label} to ${b.label}`.slice(0, 80), { groupId, shape: "line", w: Math.hypot(xB - xA, yB - yA) / W, h: 1 / H, fill: null, stroke: { color: content.accent, width: 4, dash: [] }, connector: { route: "straight", start: "none", end: id === "mindmap" ? "none" : "arrow", bend: 0.5 }, transform: { x: (xA + xB) / (2 * W), y: (yA + yB) / (2 * H), rotation: Math.atan2(yB - yA, xB - xA) * 180 / Math.PI, scale: 1 } });
    const label = edgeLabels[edgeIndex]?.trim();
    if (label) {
      const track: Track = { id: makeId(), kind: "text", name: label.slice(0, 40), muted: false, hidden: false };
      const distance = Math.max(1, Math.hypot(xB - xA, yB - yA)), offset = 18 * H / 1080;
      const text: TextClip = { ...timing, id: makeId(), trackId: track.id, groupId, kind: "text", text: label, x: (xA + xB) / (2 * W) - (yB - yA) / distance * offset / W, y: (yA + yB) / (2 * H) + (xB - xA) / distance * offset / H, align: "centre", fontFamily: graphicFontCss(content.fontFamily), fontSize: 24, fontWeight: 500, color: content.ink, lineHeight: 1.2, maxWidth: Math.min(0.25, distance / W * 0.7), maxHeight: 0.07, background: { color: content.fill, opacity: 1, padding: 5, radius: 5 } };
      tracks.push(track); clips.push(text);
    }
  }
  for (const node of nodes) {
    const groupId = makeId();
    shape(node.label, { groupId, shape: node.shape, w: node.w, h: node.h, fill: content.fill, stroke: { color: content.accent, width: 3, dash: [] }, radius: node.shape === "rect" ? 18 : undefined, transform: { x: node.x, y: node.y, rotation: 0, scale: 1 } });
    const track: Track = { id: makeId(), kind: "text", name: node.label.slice(0, 40), muted: false, hidden: false };
    const fontSize = Math.max(12, Math.min(42, node.w * W / H * 1080 / Math.max(5, Math.sqrt(node.label.length) * 1.4), node.h * 1080 / 3));
    const text: TextClip = { ...timing, id: makeId(), trackId: track.id, groupId, kind: "text", text: node.label, x: node.x, y: node.y, align: "centre", fontFamily: graphicFontCss(content.fontFamily), fontSize, fontWeight: 600, color: content.ink, lineHeight: 1.2, maxWidth: node.w * (node.shape === "hexagon" ? 0.58 : 0.8), maxHeight: node.h * 0.72 };
    tracks.push(track); clips.push(text);
  }
  if (project.tracks.length + tracks.length > 200 || project.clips.length + clips.length > 10000 || JSON.stringify(project).length + JSON.stringify(clips).length > 6 * 1024 * 1024) throw new Error("This diagram exceeds the design’s layer or size limits");
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, id: clips.find(clip => clip.kind === "text")?.id ?? clips[0].id };
}
