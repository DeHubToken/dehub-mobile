import type { ChartData } from "./dataVisuals";
export type ChartStyleGeometry = Pick<ChartData, "lineWidth" | "lineStyle" | "pointSize" | "areaOpacity" | "barGap" | "showGrid" | "showAxisValues" | "donutHole" | "legendPosition">;
export interface ChartStylePreset { id: string; label: string; description: string; colours: readonly string[]; geometry: ChartStyleGeometry }
export const CHART_STYLE_PRESETS: readonly ChartStylePreset[] = [
  { id: "clean", label: "Clean", description: "Open spacing and clear markers", colours: ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#818cf8"], geometry: { lineWidth: 1, lineStyle: "straight", pointSize: 1, areaOpacity: 0.2, barGap: 0.28, showGrid: true, showAxisValues: true, donutHole: 0.6, legendPosition: "bottom" } },
  { id: "minimal", label: "Minimal", description: "Fine lines and quiet detail", colours: ["#cbd5e1", "#94a3b8", "#64748b", "#e2e8f0", "#a1a1aa", "#71717a"], geometry: { lineWidth: 0.65, lineStyle: "straight", pointSize: 0, areaOpacity: 0.12, barGap: 0.45, showGrid: false, showAxisValues: false, donutHole: 0.72, legendPosition: "bottom" } },
  { id: "bold", label: "Bold", description: "Strong strokes and broad columns", colours: ["#fb7185", "#fbbf24", "#a78bfa", "#22d3ee", "#4ade80", "#f97316"], geometry: { lineWidth: 2.2, lineStyle: "straight", pointSize: 1.5, areaOpacity: 0.45, barGap: 0.12, showGrid: false, showAxisValues: true, donutHole: 0.42, legendPosition: "bottom" } },
  { id: "flow", label: "Flow", description: "Smooth curves and soft areas", colours: ["#2dd4bf", "#60a5fa", "#a78bfa", "#f0abfc", "#fda4af", "#fde68a"], geometry: { lineWidth: 1.3, lineStyle: "smooth", pointSize: 0, areaOpacity: 0.28, barGap: 0.3, showGrid: true, showAxisValues: true, donutHole: 0.65, legendPosition: "bottom" } },
  { id: "technical", label: "Technical", description: "Stepped lines and readable scales", colours: ["#67e8f9", "#a3e635", "#facc15", "#c084fc", "#fb923c", "#f472b6"], geometry: { lineWidth: 1, lineStyle: "step", pointSize: 0.8, areaOpacity: 0.18, barGap: 0.2, showGrid: true, showAxisValues: true, donutHole: 0.55, legendPosition: "right" } },
  { id: "editorial", label: "Editorial", description: "Measured spacing and muted colour", colours: ["#d6a77a", "#94b5a1", "#b6a4cc", "#d9bd7f", "#7ca6bf", "#c88f9e"], geometry: { lineWidth: 1.1, lineStyle: "straight", pointSize: 0.7, areaOpacity: 0.16, barGap: 0.4, showGrid: false, showAxisValues: true, donutHole: 0.68, legendPosition: "right" } },
];
export function matchingChartStyle(value: ChartStyleGeometry): string | null {
  return CHART_STYLE_PRESETS.find(preset => (Object.keys(preset.geometry) as (keyof ChartStyleGeometry)[]).every(key => value[key] === preset.geometry[key]))?.id ?? null;
}
