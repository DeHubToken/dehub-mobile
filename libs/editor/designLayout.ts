export interface DesignLayoutBox { id: string; groupId?: string; cx: number; cy: number; w: number; h: number; rotation: number }
export type LayoutAction = "left" | "centre" | "right" | "top" | "middle" | "bottom" | "horizontal" | "vertical" | "tidy";
export const LAYOUT_ACTIONS: Array<{ action: LayoutAction; label: string }> = [
  { action: "left", label: "Align left" }, { action: "centre", label: "Centre horizontally" }, { action: "right", label: "Align right" },
  { action: "top", label: "Align top" }, { action: "middle", label: "Centre vertically" }, { action: "bottom", label: "Align bottom" },
  { action: "horizontal", label: "Space horizontally" }, { action: "vertical", label: "Space vertically" }, { action: "tidy", label: "Tidy into a grid" },
];

/** Work on group bounds so alignment never pulls a grouped composition apart. */
export function layoutDesign(boxes: DesignLayoutBox[], action: LayoutAction, page: { width: number; height: number },
  reference: "page" | "selection" = "selection", columns = 0, gap = 24): Array<{ id: string; dx: number; dy: number }> {
  const units = new Map<string, { ids: string[]; left: number; top: number; right: number; bottom: number }>();
  for (const box of boxes) {
    if (![box.cx, box.cy, box.w, box.h, box.rotation].every(Number.isFinite)) continue;
    const angle = box.rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    const hw = (box.w * c + box.h * s) / 2, hh = (box.h * c + box.w * s) / 2;
    const key = box.groupId ? `group:${box.groupId}` : `layer:${box.id}`;
    const unit = units.get(key);
    if (unit) {
      unit.ids.push(box.id); unit.left = Math.min(unit.left, box.cx - hw); unit.right = Math.max(unit.right, box.cx + hw);
      unit.top = Math.min(unit.top, box.cy - hh); unit.bottom = Math.max(unit.bottom, box.cy + hh);
    } else units.set(key, { ids: [box.id], left: box.cx - hw, right: box.cx + hw, top: box.cy - hh, bottom: box.cy + hh });
  }
  const items = [...units.values()].map(unit => ({ ...unit, cx: (unit.left + unit.right) / 2, cy: (unit.top + unit.bottom) / 2, w: unit.right - unit.left, h: unit.bottom - unit.top }));
  if (!items.length) return [];
  const left = Math.min(...items.map(i => i.left)), right = Math.max(...items.map(i => i.right));
  const top = Math.min(...items.map(i => i.top)), bottom = Math.max(...items.map(i => i.bottom));
  const bounds = reference === "page" ? { left: 0, right: page.width, top: 0, bottom: page.height } : { left, right, top, bottom };
  const moves: Array<{ id: string; dx: number; dy: number }> = [];
  const move = (item: typeof items[number], dx: number, dy: number) => item.ids.forEach(id => moves.push({ id, dx, dy }));
  if (action === "horizontal" || action === "vertical") {
    if (items.length < 3) return [];
    const horizontal = action === "horizontal";
    items.sort((a, b) => horizontal ? a.cx - b.cx : a.cy - b.cy);
    const first = items[0], last = items[items.length - 1];
    const start = horizontal ? first.left : first.top, end = horizontal ? last.right : last.bottom;
    const spacing = (end - start - items.reduce((n, item) => n + (horizontal ? item.w : item.h), 0)) / (items.length - 1);
    let cursor = start;
    items.forEach(item => { const delta = cursor - (horizontal ? item.left : item.top); move(item, horizontal ? delta : 0, horizontal ? 0 : delta); cursor += (horizontal ? item.w : item.h) + spacing; });
  } else if (action === "tidy") {
    if (items.length < 2) return [];
    const count = Math.min(items.length, Math.max(1, Math.round(columns || Math.ceil(Math.sqrt(items.length)))));
    const rows = Math.ceil(items.length / count), spacing = Math.max(0, Math.min(1000, Number.isFinite(gap) ? gap : 24));
    const cellWidth = Math.max(...items.map(item => item.w)), cellHeight = Math.max(...items.map(item => item.h));
    const x = (left + right - (count * cellWidth + (count - 1) * spacing)) / 2;
    const y = (top + bottom - (rows * cellHeight + (rows - 1) * spacing)) / 2;
    items.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    for (let row = 0; row < rows; row++) {
      const line = items.slice(row * count, (row + 1) * count).sort((a, b) => a.cx - b.cx);
      line.forEach((item, col) => move(item, x + col * (cellWidth + spacing) + cellWidth / 2 - item.cx, y + row * (cellHeight + spacing) + cellHeight / 2 - item.cy));
    }
  } else {
    items.forEach(item => {
      const dx = action === "left" ? bounds.left - item.left : action === "right" ? bounds.right - item.right : action === "centre" ? (bounds.left + bounds.right) / 2 - item.cx : 0;
      const dy = action === "top" ? bounds.top - item.top : action === "bottom" ? bounds.bottom - item.bottom : action === "middle" ? (bounds.top + bounds.bottom) / 2 - item.cy : 0;
      move(item, dx, dy);
    });
  }
  return moves.filter(move => Math.abs(move.dx) > 1e-7 || Math.abs(move.dy) > 1e-7);
}
