import { drawGraphicText } from "./graphicText";
import { chartValueLabel } from "./chartValueFormat";
import { graphicFontCss } from "./graphicFonts";
import { treemapDataError } from "./treemapChart";
import type { ChartData, DataVisualContext } from "./dataVisuals";
type PackedNode = { name: string; value: number; index: number; x: number; y: number; r: number; margin: number; children: PackedNode[] };
const packedLayoutCache = new Map<string, PackedNode>();
function placePackedSiblings(nodes: PackedNode[], gap: number): number {
  const placed: PackedNode[] = [];
  for (const node of [...nodes].sort((a, b) => b.r - a.r || a.index - b.index)) {
    if (!placed.length) { node.x = 0; node.y = 0; placed.push(node); continue; }
    const candidates: { x: number; y: number }[] = [];
    const epsilon = Math.max(1e-9, node.r * 1e-8);
    for (const a of placed) {
      const radius = a.r + node.r + gap;
      candidates.push({ x: a.x + radius, y: a.y }, { x: a.x - radius, y: a.y }, { x: a.x, y: a.y + radius }, { x: a.x, y: a.y - radius });
    }
    for (let first = 0; first < placed.length; first++) for (let second = first + 1; second < placed.length; second++) {
      const a = placed[first], b = placed[second], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), ra = a.r + node.r + gap, rb = b.r + node.r + gap;
      if (distance < epsilon || distance > ra + rb || distance < Math.abs(ra - rb)) continue;
      const along = (ra * ra - rb * rb + distance * distance) / (2 * distance), perpendicular = Math.sqrt(Math.max(0, ra * ra - along * along)), x = a.x + dx / distance * along, y = a.y + dy / distance * along;
      candidates.push({ x: x - dy / distance * perpendicular, y: y + dx / distance * perpendicular }, { x: x + dy / distance * perpendicular, y: y - dx / distance * perpendicular });
    }
    let best: { x: number; y: number } | null = null, score = Infinity;
    const minX = Math.min(...placed.map(node => node.x - node.r)), maxX = Math.max(...placed.map(node => node.x + node.r)), minY = Math.min(...placed.map(node => node.y - node.r)), maxY = Math.max(...placed.map(node => node.y + node.r));
    for (const candidate of candidates) {
      if (placed.some(other => Math.hypot(candidate.x - other.x, candidate.y - other.y) < node.r + other.r + gap - epsilon)) continue;
      const w = Math.max(maxX, candidate.x + node.r) - Math.min(minX, candidate.x - node.r), h = Math.max(maxY, candidate.y + node.r) - Math.min(minY, candidate.y - node.r), next = w * w + h * h;
      if (next < score) { best = candidate; score = next; }
    }
    node.x = best?.x ?? maxX + gap + node.r; node.y = best?.y ?? 0; placed.push(node);
  }
  if (!placed.length) return 0;
  const centreX = (Math.min(...placed.map(node => node.x - node.r)) + Math.max(...placed.map(node => node.x + node.r))) / 2, centreY = (Math.min(...placed.map(node => node.y - node.r)) + Math.max(...placed.map(node => node.y + node.r))) / 2;
  for (const node of placed) { node.x -= centreX; node.y -= centreY; }
  return Math.max(...placed.map(node => Math.hypot(node.x, node.y) + node.r));
}
function packedHierarchy(rows: ChartData["rows"], spacing: number): PackedNode {
  const key = JSON.stringify([rows, spacing]), saved = packedLayoutCache.get(key);
  if (saved) return saved;
  const root: PackedNode = { name: "", value: 0, index: 0, x: 0, y: 0, r: 0, margin: 0, children: [] };
  rows.forEach((row, index) => {
    if (row.value <= 0) return;
    let node = root; node.value += row.value;
    for (const name of row.label.split("/").map(part => part.trim())) {
      let next = node.children.find(child => child.name === name);
      if (!next) { next = { name, value: 0, index, x: 0, y: 0, r: 0, margin: 0, children: [] }; node.children.push(next); }
      next.value += row.value; node = next;
    }
  });
  const gap = Math.sqrt(Math.max(...rows.map(row => row.value))) * spacing * 0.2;
  const layout = (node: PackedNode): void => {
    if (!node.children.length) { node.r = Math.sqrt(node.value); return; }
    node.children.forEach(layout);
    node.r = placePackedSiblings(node.children, gap);
    node.margin = node.name ? Math.max(gap, Math.max(...node.children.map(child => child.r)) * 0.18) : 0;
    node.r += node.margin;
    if (node.margin) for (const child of node.children) child.y += node.margin / 2;
  };
  layout(root);
  if (packedLayoutCache.size >= 16) packedLayoutCache.clear();
  packedLayoutCache.set(key, root); return root;
}
export function drawPackedCirclesChart(ctx: DataVisualContext, width: number, height: number, chart: ChartData): void {
  const rows = chart.rows.slice(0, 50);
  if (treemapDataError(rows)) return;
  const root = packedHierarchy(rows, Math.max(0, Math.min(0.9, chart.barGap ?? 0.12)));
  const scale = Math.max(0, Math.min(width, height) * 0.46 / Math.max(1e-12, root.r)), colours = chart.colours.length ? chart.colours : ["#38bdf8"];
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, chart.fontScale || 1)), family = graphicFontCss(chart.fontFamily);
  const label = (text: string, x: number, y: number, available: number, size: number) => {
    if (size < 5 || available < size) return;
    ctx.font = "500 " + size + "px " + family; ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let value = text.slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > available) value = value.slice(0, -2) + "…";
    if (ctx.measureText(value).width <= available) drawGraphicText(ctx,value, x, y);
  };
  const draw = (node: PackedNode, x: number, y: number): void => {
    const cx = x + node.x * scale, cy = y + node.y * scale, radius = node.r * scale;
    if (node.name) {
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (node.children.length) { ctx.strokeStyle = colours[node.index % colours.length]; ctx.lineWidth = Math.max(0.5, width / 1000); ctx.stroke(); }
      else { ctx.fillStyle = colours[node.index % colours.length]; ctx.fill(); }
    }
    for (const child of node.children) draw(child, cx, cy);
    if (!node.children.length) {
      const size = Math.min(font, radius * (chart.showLabels && chart.showValues ? 0.35 : 0.5)), lines = Number(chart.showLabels) + Number(chart.showValues);
      if (chart.showLabels) label(node.name, cx, cy - (lines > 1 ? size * 0.7 : 0), radius * 1.5, size);
      if (chart.showValues) label(chartValueLabel(node.value, chart.valueFormat), cx, cy + (lines > 1 ? size * 0.7 : 0), radius * 1.5, size);
    } else if (node.name && chart.showLabels) { const margin = node.margin * scale; label(node.name, cx, cy - radius + margin * 0.7, radius, Math.min(font, margin * 0.8)); }
  };
  draw(root, 0, 0);
}
