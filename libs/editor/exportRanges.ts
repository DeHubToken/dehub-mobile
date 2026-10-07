import type { MediaClip, ProjectSnapshot } from "./types";
import { EXPORT_RANGES_RUNTIME } from "./exportRangesRuntime";

export type ExportScope = "timeline" | "selection" | "clips";
export interface ExportRange { start: number; end: number }
export interface ClipExportRange extends ExportRange { clipId: string; name: string }
export interface AudioExportSegment {
  when: number; offset: number; sourceSeconds: number; speed: number;
  envelope: { time: number; gain: number }[];
}
const runtime = new Function(EXPORT_RANGES_RUNTIME + "; return { exportTimeRange, exportAudioSegment };")() as {
  exportTimeRange: (fullDuration: number, range?: ExportRange) => ExportRange & { duration: number };
  exportAudioSegment: (clip: MediaClip, sourceDuration: number, range: ExportRange) => AudioExportSegment | null;
};
export const exportTimeRange = runtime.exportTimeRange;
export const exportAudioSegment = runtime.exportAudioSegment;

/** Range exports retain every visible overlay and soundtrack at its original time. */
export function clipExportRanges(snapshot: ProjectSnapshot, selectedIds?: string[]): ClipExportRange[] {
  const selected = selectedIds ? new Set(selectedIds) : null;
  const visible = new Set(snapshot.tracks.filter(t => !t.hidden && t.kind !== "audio").map(t => t.id));
  const clips = snapshot.clips.filter(c => c.kind === "video" && !c.hidden && visible.has(c.trackId) && (!selected || selected.has(c.id)));
  const title = (snapshot.title || "video").replace(/[^\w-]+/g, "_").slice(0, 60);
  return [...clips].sort((a, b) => a.start - b.start || snapshot.tracks.findIndex(t => t.id === a.trackId) - snapshot.tracks.findIndex(t => t.id === b.trackId) || a.id.localeCompare(b.id)).map((clip, i) => {
    if (!Number.isFinite(clip.start) || clip.start < 0 || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error("Invalid clip range");
    return { clipId: clip.id, start: clip.start, end: clip.start + clip.duration, name: `${title}-clip-${String(i + 1).padStart(3, "0")}` };
  });
}
