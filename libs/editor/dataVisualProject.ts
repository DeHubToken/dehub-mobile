import { validDataVisuals, type ChartData, type TableData } from "./dataVisuals";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";
import { getPages, pageAt } from "./pages";

export const DEFAULT_CHART: ChartData = { kind: "column", rows: [{ label: "January", value: 40 }, { label: "February", value: 65 }, { label: "March", value: 85 }],
  colours: ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#fb7185"], textColour: "#ffffff", showLabels: true, showValues: true };
export const DEFAULT_TABLE: TableData = { rows: [["Item", "Details", "Status"], ["First", "Add your content", "Ready"], ["Second", "Edit every cell", "In progress"]],
  header: true, headerColour: "#1e293b", headerTextColour: "#ffffff", cellColour: "#f8fafc", textColour: "#0f172a", borderColour: "#94a3b8" };

/** Insert or update one graphic as one layer and one undo step. */
export function putDataVisual(project: ProjectSnapshot, time: number, data: { chart: ChartData } | { table: TableData }, makeId: () => string, selectedId?: string | null) {
  if (!validDataVisuals(data)) throw new Error("Invalid chart or table data");
  const target = project.clips.find(c => c.id === selectedId);
  if (target?.kind === "shape" && (target.chart || target.table)) {
    if (target.locked) return null;
    return { project: { ...project, clips: project.clips.map(clip => clip.id === target.id ? { ...target, chart: undefined, table: undefined, ...data } : clip) }, id: target.id };
  }
  const page = pageAt(getPages(project.settings, project.clips), time);
  const track: Track = { id: makeId(), kind: "video", name: "chart" in data ? "Chart" : "Table", muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "rect", start: page.start, duration: page.end - page.start,
    trimIn: 0, w: 0.8, h: 0.65, fill: null, stroke: null, ...data };
  return { project: { ...project, tracks: [...project.tracks, track], clips: [...project.clips, clip] }, id: clip.id };
}
