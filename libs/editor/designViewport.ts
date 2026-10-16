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
