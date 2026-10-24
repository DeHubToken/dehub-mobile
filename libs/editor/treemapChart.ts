import { drawGraphicText } from "./graphicText";
import { chartValueLabel } from "./chartValueFormat";
import { graphicFontCss } from "./graphicFonts";
import type { ChartData, DataVisualContext } from "./dataVisuals";
type TreemapNode = { name: string; weight: number; index: number; children: TreemapNode[] };
export function treemapDataError(rows: readonly { label: string; value: number }[]): string {
  if (!rows.length || rows.some(row => !Number.isFinite(row.value) || row.value < 0) || !rows.some(row => row.value > 0)) return "Hierarchy values must be nonnegative, with at least one positive value";
  const paths = rows.map(row => row.label.split("/").map(part => part.trim()));
  if (paths.some(path => path.length > 6 || path.some(part => !part))) return "Use one to six nonempty path names separated by /";
  const keys = paths.map(path => JSON.stringify(path));
  if (new Set(keys).size !== keys.length) return "Give each hierarchy leaf a unique path";
  if (paths.some((path, index) => paths.some((other, next) => index !== next && path.length < other.length && path.every((part, depth) => other[depth] === part)))) return "A hierarchy path cannot be both a leaf and a group. Put each value in its own leaf";
  return "";
}
export function drawTreemapChart(ctx: DataVisualContext, width: number, height: number, chart: ChartData): void {
  const rows = chart.rows.slice(0, 50);
  if (treemapDataError(rows)) return;
  const root: TreemapNode = { name: "", weight: 0, index: 0, children: [] };
  rows.forEach((row, index) => {
    if (row.value <= 0) return;
    let node = root; node.weight += row.value;
    for (const name of row.label.split("/").map(part => part.trim())) {
      let child = node.children.find(item => item.name === name);
      if (!child) { child = { name, weight: 0, index, children: [] }; node.children.push(child); }
      child.weight += row.value; node = child;
    }
  });
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, chart.fontScale || 1));
  const family = graphicFontCss(chart.fontFamily), colours = chart.colours.length ? chart.colours : ["#38bdf8"];
  const gap = Math.min(width, height) * 0.025 * Math.max(0, Math.min(0.9, chart.barGap ?? 0.12));
  const fit = (text: string, x: number, y: number, available: number, size: number) => {
    if (available < size) return;
    ctx.font = "500 " + size + "px " + family;
    let label = text.slice(0, 200);
    while (label.length > 1 && ctx.measureText(label).width > available) label = label.slice(0, -2) + "…";
    if (ctx.measureText(label).width <= available) drawGraphicText(ctx,label, x, y);
  };
  const tile = (node: TreemapNode, x: number, y: number, w: number, h: number): void => {
    if (w < 1 || h < 1) return;
    const colour = colours[node.index % colours.length];
    if (!node.children.length) {
      ctx.fillStyle = colour; ctx.fillRect(x + gap / 2, y + gap / 2, Math.max(0, w - gap), Math.max(0, h - gap));
      ctx.fillStyle = chart.textColour; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      const size = Math.min(font, Math.max(5, h / (chart.showValues && chart.showLabels ? 4 : 2.5))), line = size * 1.4;
      const lines = Number(chart.showLabels) + Number(chart.showValues), centreY = y + h / 2;
      if (h < size * 1.5 + gap || w < size * 2 + gap) return;
      if (chart.showLabels) fit(node.name, x + w / 2, centreY - (lines > 1 ? line / 2 : 0), w - gap - size, size);
      if (chart.showValues) fit(chartValueLabel(node.weight, chart.valueFormat), x + w / 2, centreY + (lines > 1 ? line / 2 : 0), w - gap - size, size);
      return;
    }
    const header = node.name && chart.showLabels && h > font * 5 && w > font * 4 ? font * 1.6 : 0;
    if (node.name) {
      ctx.strokeStyle = colour; ctx.lineWidth = Math.max(0.5, Math.min(2, width / 900));
      ctx.strokeRect(x + gap / 2, y + gap / 2, Math.max(0, w - gap), Math.max(0, h - gap));
      if (header) { ctx.fillStyle = chart.textColour; ctx.textAlign = "left"; ctx.textBaseline = "middle"; fit(node.name, x + gap + font / 2, y + header / 2, w - gap * 2 - font, font); }
    }
    partition([...node.children].sort((a, b) => b.weight - a.weight || a.index - b.index), x + (node.name ? gap : 0), y + header + (node.name ? gap : 0), w - (node.name ? gap * 2 : 0), h - header - (node.name ? gap * 2 : 0));
  };
  const partition = (nodes: TreemapNode[], x: number, y: number, w: number, h: number): void => {
    if (!nodes.length || w < 1 || h < 1) return;
    if (nodes.length === 1) { tile(nodes[0], x, y, w, h); return; }
    const total = nodes.reduce((sum, node) => sum + node.weight, 0);
    let split = 1, firstWeight = nodes[0].weight;
    while (split < nodes.length - 1 && Math.abs(total / 2 - (firstWeight + nodes[split].weight)) < Math.abs(total / 2 - firstWeight)) { firstWeight += nodes[split].weight; split++; }
    const fraction = firstWeight / total;
    if (w >= h) { partition(nodes.slice(0, split), x, y, w * fraction, h); partition(nodes.slice(split), x + w * fraction, y, w * (1 - fraction), h); }
    else { partition(nodes.slice(0, split), x, y, w, h * fraction); partition(nodes.slice(split), x, y + h * fraction, w, h * (1 - fraction)); }
  };
  tile(root, -width / 2, -height / 2, width, height);
}
