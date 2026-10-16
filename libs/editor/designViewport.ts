export interface DesignViewport { zoom: number; x: number; y: number }
export const FIT_VIEWPORT: DesignViewport = { zoom: 1, x: 0, y: 0 };
export const VIEWPORT_ZOOM_MIN = 0.25;
export const VIEWPORT_ZOOM_MAX = 8;
export function viewportZoom(value: number): number {
  return Math.max(VIEWPORT_ZOOM_MIN, Math.min(VIEWPORT_ZOOM_MAX, Number.isFinite(value) ? value : 1));
}
/** Keep the point under a wheel or pinch anchor fixed while the document changes scale. */
export function zoomDesignViewport(before: DesignViewport, nextZoom: number, anchor: { x: number; y: number } = { x: 0, y: 0 }): DesignViewport {
  const zoom = viewportZoom(nextZoom), ratio = zoom / before.zoom;
  return { zoom, x: anchor.x - (anchor.x - before.x) * ratio, y: anchor.y - (anchor.y - before.y) * ratio };
}

export function focusDesignSelection(boxes: readonly { cx: number; cy: number; w: number; h: number; rotation: number }[], page: { width: number; height: number }, fitScale: number, available: { width: number; height: number }): DesignViewport | null {
  if (!boxes.length || !Number.isFinite(fitScale) || fitScale <= 0 || available.width <= 0 || available.height <= 0) return null;
  const bounds = boxes.flatMap(box => {
    if (![box.cx, box.cy, box.w, box.h, box.rotation].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return [];
    const angle = box.rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle)), hw = (box.w * c + box.h * s) / 2, hh = (box.h * c + box.w * s) / 2;
    return [{ left: box.cx - hw, right: box.cx + hw, top: box.cy - hh, bottom: box.cy + hh }];
  });
  if (!bounds.length) return null;
  const left = Math.min(...bounds.map(box => box.left)), right = Math.max(...bounds.map(box => box.right)), top = Math.min(...bounds.map(box => box.top)), bottom = Math.max(...bounds.map(box => box.bottom));
  const zoom = viewportZoom(Math.min(Math.max(1, available.width - 64) / ((right - left) * fitScale), Math.max(1, available.height - 64) / ((bottom - top) * fitScale)));
  return { zoom, x: (page.width / 2 - (left + right) / 2) * fitScale * zoom, y: (page.height / 2 - (top + bottom) / 2) * fitScale * zoom };
}
