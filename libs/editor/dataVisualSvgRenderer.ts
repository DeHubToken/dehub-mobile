import { validDataVisuals } from "./dataVisuals";
import type { SvgDataVisual } from "./dataVisualSvg";
type Renderer = (value: SvgDataVisual, width: number, height: number, signal: AbortSignal) => Promise<string>;
const renderers = new Map<string, Renderer>();
export function registerDataVisualSvgRenderer(projectId: string, render: Renderer): () => void { renderers.set(projectId, render); return () => { if (renderers.get(projectId) === render) renderers.delete(projectId); }; }
export async function requestDataVisualSvg(projectId: string, value: SvgDataVisual, width: number, height: number, signal: AbortSignal): Promise<string> {
  if (!validDataVisuals(value) || JSON.stringify(value).length > 250000 || ![width, height].every(value => Number.isFinite(value) && value >= 32 && value <= 8192)) throw new Error("Enter valid graphic data and dimensions before exporting");
  const render = renderers.get(projectId); if (!render) throw new Error("The design canvas is not ready");
  if (signal.aborted) throw new Error("Vector export cancelled");
  const svg = await render(value, width, height, signal);
  if (signal.aborted || renderers.get(projectId) !== render) throw new Error("Vector export cancelled");
  if (typeof svg !== "string" || !svg.startsWith("<?xml") || svg.length > 2 * 1024 * 1024) throw new Error("Could not render the vector graphic");
  return svg;
}
