import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";

export const CONNECTOR_ROUTES = ["straight", "elbow", "curve"] as const;
export const CONNECTOR_CAPS = ["none", "arrow", "circle", "diamond"] as const;
export interface ConnectorStyle {
  route: typeof CONNECTOR_ROUTES[number]; start: typeof CONNECTOR_CAPS[number]; end: typeof CONNECTOR_CAPS[number]; bend: number;
}
export const DEFAULT_CONNECTOR: ConnectorStyle = { route: "elbow", start: "none", end: "arrow", bend: 0.5 };

export function validConnector(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ConnectorStyle;
  return CONNECTOR_ROUTES.includes(item.route) && CONNECTOR_CAPS.includes(item.start) && CONNECTOR_CAPS.includes(item.end) && Number.isFinite(item.bend) && item.bend >= 0.1 && item.bend <= 0.9;
}

export function connectorGeometry(width: number, height: number, style: ConnectorStyle): { points: number[][]; controls: number[][] | null } {
  const x = width / 2, y = height / 2, bend = -x + width * Math.max(0.1, Math.min(0.9, style.bend));
  return { points: style.route === "elbow" ? [[-x, -y], [bend, -y], [bend, y], [x, y]] : [[-x, -y], [x, y]], controls: style.route === "curve" ? [[bend, -y], [bend, y]] : null };
}

export function connectorSvgPath(width: number, height: number, style: ConnectorStyle): string {
  const geometry = connectorGeometry(width, height, style), points = geometry.points;
  return `M ${points[0].join(" ")} ` + (geometry.controls ? `C ${geometry.controls.map(point => point.join(" ")).join(" ")} ${points[1].join(" ")}` : points.slice(1).map(point => `L ${point.join(" ")}`).join(" "));
}

interface ConnectorContext {
  fillStyle: unknown; strokeStyle: unknown; lineWidth: number; lineCap: string; lineJoin: string;
  save(): void; restore(): void; beginPath(): void; closePath(): void; stroke(): void; fill(): void;
  moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, from: number, to: number): void; setLineDash(value: number[]): void;
}

export function drawConnector(ctx: ConnectorContext, width: number, height: number, style: ConnectorStyle): void {
  const geometry = connectorGeometry(width, height, style), points = geometry.points, controls = geometry.controls;
  ctx.save(); ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (controls) ctx.bezierCurveTo(controls[0][0], controls[0][1], controls[1][0], controls[1][1], points[1][0], points[1][1]);
  else for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle;
  const size = Math.min(width / 5, Math.max(ctx.lineWidth * 3.5, width / 35));
  for (const end of [false, true]) {
    const cap = end ? style.end : style.start;
    if (cap === "none") continue;
    const tip = end ? points[points.length - 1] : points[0];
    const from = controls ? controls[end ? 1 : 0] : points[end ? points.length - 2 : 1];
    const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const dx = Math.cos(angle), dy = Math.sin(angle), cx = tip[0] - dx * size / 2, cy = tip[1] - dy * size / 2;
    ctx.beginPath();
    if (cap === "circle") ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    else {
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(cx - dy * size / 2, cy + dx * size / 2);
      if (cap === "diamond") ctx.lineTo(tip[0] - dx * size, tip[1] - dy * size);
      else ctx.lineTo(tip[0] - dx * size * 0.85, tip[1] - dy * size * 0.85);
      ctx.lineTo(cx + dy * size / 2, cy - dx * size / 2); ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

export function putConnector(project: ProjectSnapshot, time: number, connector: ConnectorStyle, colour: string, width: number, dash: number[], makeId: () => string, selectedId?: string | null) {
  if (!validConnector(connector) || !/^#[\da-f]{6}$/i.test(colour) || !Number.isFinite(width) || width < 1 || width > 40) return null;
  const selected = project.clips.find(clip => clip.id === selectedId);
  const existing = selected?.kind === "shape" && (selected.connector || selected.shape === "line" || selected.shape === "arrow") ? selected : undefined;
  if (existing?.locked) return null;
  if (existing) return { project: { ...project, clips: project.clips.map(clip => clip.id === existing.id ? { ...existing, connector, shape: "line", fill: null, stroke: { dashOffset: existing.stroke?.dashOffset, opacity: existing.stroke?.opacity, color: colour, width, dash } } as ShapeClip : clip) }, id: existing.id };
  const page = pageAt(getPages(project.settings, project.clips), time);
  const track: Track = { id: makeId(), kind: "video", name: "Connector", muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "line", start: page.start, duration: page.end - page.start, trimIn: 0, w: 0.45, h: 0.18, fill: null, stroke: { color: colour, width, dash }, connector };
  return { project: { ...project, tracks: [...project.tracks, track], clips: [...project.clips, clip] }, id: clip.id };
}
