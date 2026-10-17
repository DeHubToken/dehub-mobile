export interface SpacingBox { cx: number; cy: number; w: number; h: number; rotation: number }
export interface SpacingGuide { axis: "horizontal" | "vertical"; from: number; to: number; at: number; gap: number }
export function spacingBounds(box: SpacingBox) {
  const angle = box.rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const hw = (box.w * c + box.h * s) / 2, hh = (box.h * c + box.w * s) / 2;
  return { left: box.cx - hw, right: box.cx + hw, top: box.cy - hh, bottom: box.cy + hh };
}
export function selectionSpacingBox(boxes: readonly SpacingBox[]): SpacingBox | undefined {
  const bounds = boxes.filter(box => [box.cx, box.cy, box.w, box.h, box.rotation].every(Number.isFinite)).map(spacingBounds);
  if (!bounds.length) return undefined;
  const left = Math.min(...bounds.map(box => box.left)), right = Math.max(...bounds.map(box => box.right)), top = Math.min(...bounds.map(box => box.top)), bottom = Math.max(...bounds.map(box => box.bottom));
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top, rotation: 0 };
}
/** Equalize the gaps between the nearest neighbours in the same row or column. */
export function smartSpacingSnap(moving: SpacingBox, otherBoxes: readonly SpacingBox[], threshold: number, axes: { horizontal: boolean; vertical: boolean } = { horizontal: true, vertical: true }): { dx: number; dy: number; guides: SpacingGuide[] } {
  if (!Number.isFinite(threshold) || threshold <= 0) return { dx: 0, dy: 0, guides: [] };
  const bounds = spacingBounds(moving), others = otherBoxes.filter(box => [box.cx, box.cy, box.w, box.h, box.rotation].every(Number.isFinite) && box.w > 0 && box.h > 0).map(spacingBounds);
  const guides: SpacingGuide[] = []; let dx = 0, dy = 0;
  for (const axis of ["horizontal", "vertical"] as const) {
    const horizontal = axis === "horizontal", from = horizontal ? bounds.left : bounds.top, to = horizontal ? bounds.right : bounds.bottom;
    const crossFrom = horizontal ? bounds.top : bounds.left, crossTo = horizontal ? bounds.bottom : bounds.right;
    let before: typeof bounds | undefined, after: typeof bounds | undefined;
    for (const other of others) {
      const crossLeft = horizontal ? other.top : other.left, crossRight = horizontal ? other.bottom : other.right;
      if (Math.min(crossTo, crossRight) - Math.max(crossFrom, crossLeft) < Math.min(crossTo - crossFrom, crossRight - crossLeft) * 0.2) continue;
      const left = horizontal ? other.left : other.top, right = horizontal ? other.right : other.bottom;
      if (right <= from + threshold && (!before || right > (horizontal ? before.right : before.bottom))) before = other;
      if (left >= to - threshold && (!after || left < (horizontal ? after.left : after.top))) after = other;
    }
    if (!before || !after || before === after) continue;
    const end = horizontal ? before.right : before.bottom, start = horizontal ? after.left : after.top;
    const gap = (start - end - (to - from)) / 2, shift = end + gap - from;
    if (gap < 0 || Math.abs(shift) > threshold) continue;
    if (!axes[axis] && Math.abs(shift) > 1e-6) continue;
    if (horizontal) dx = shift; else dy = shift;
    const at = horizontal ? moving.cy : moving.cx;
    guides.push({ axis, from: end, to: from + shift, at, gap }, { axis, from: to + shift, to: start, at, gap });
  }
  return { dx, dy, guides: guides.map(guide => ({ ...guide, at: guide.at + (guide.axis === "horizontal" ? dy : dx) })) };
}
