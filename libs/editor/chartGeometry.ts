import type { ChartData } from "./dataVisuals";
export type ChartGeometry = Pick<ChartData, "labelEvery" | "labelAngle" | "labelWrap" | "pointLabelMode" | "lineWidth" | "scatterLines" | "lineStyle" | "pointSize" | "areaOpacity" | "barGap" | "showGrid" | "showAxisValues">;
export const CHART_GEOMETRY_CONTROLS = [
  { key: "lineWidth", label: "Line weight", min: 0.25, max: 5, step: 0.25, kinds: ["line", "area", "lollipop", "radar", "scatter", "bubble"] },
  { key: "pointSize", label: "Point size", min: 0, max: 4, step: 0.25, kinds: ["line", "area", "lollipop", "dot", "scatter", "bubble"] },
  { key: "areaOpacity", label: "Area opacity", min: 0, max: 1, step: 0.05, kinds: ["area", "radar", "bubble"] },
  { key: "barGap", label: "Bar spacing", min: 0, max: 0.9, step: 0.05, kinds: ["column", "bar", "histogram", "race"] },
] as const;
export function defaultChartGeometry(key: keyof ChartGeometry, multiple: boolean, kind: ChartData["kind"] = "column"): number {
  if (key === "barGap" && kind === "race") return 0.25;
  if (key === "areaOpacity" && kind === "bubble") return 0.55;
  if (key === "barGap" && kind === "histogram") return 0;
  return key === "areaOpacity" ? multiple ? 0.149 : 0.267 : key === "barGap" ? multiple ? 0.24 : 0.34 : 1;
}
export function chartGeometryLabel(key: string, value: number): string { return key === "areaOpacity" || key === "barGap" ? `${Math.round(value * 100)}%` : `${value.toFixed(2).replace(/\.?0+$/, "")}×`; }
