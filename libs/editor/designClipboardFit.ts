import { resizeComposition } from "./resizeComposition";
import { DEFAULT_SETTINGS, type ProjectSettings, type ProjectSnapshot } from "./types";
import type { DesignClipboard } from "./designClipboard";

export function fitDesignClipboardSource(source: DesignClipboard, settings: ProjectSettings): DesignClipboard {
  const canvas = source.canvas;
  if (!canvas || canvas.width === settings.width && canvas.height === settings.height || source.layers.some(layer => layer.clip.kind === "image" || layer.clip.kind === "video" || layer.clip.kind === "audio")) return source;
  if (![canvas.width, canvas.height].every(value => Number.isFinite(value) && value >= 1 && value <= 16384)) throw new Error("The copied artwork has unsupported source dimensions");
  const tracks = [...new Map(source.layers.map(layer => [layer.track.id, layer.track])).values()];
  const before: ProjectSnapshot = { id: "clipboard-artwork", title: "Copied artwork", updatedAt: 0, settings: { ...DEFAULT_SETTINGS, width: canvas.width, height: canvas.height, background: canvas.background }, tracks, clips: source.layers.map(layer => layer.clip) };
  const resized = resizeComposition(before, { ...before, settings: { ...before.settings, width: settings.width, height: settings.height, aspectPreset: settings.aspectPreset } }, "fit", { x: 0.5, y: 0.5 });
  const clips = new Map(resized.clips.map(clip => [clip.id, clip]));
  return { ...source, canvas: { width: settings.width, height: settings.height, background: settings.background }, layers: source.layers.map(layer => ({ ...layer, clip: clips.get(layer.clip.id)! })) };
}
