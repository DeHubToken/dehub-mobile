import type { ChartData } from "./dataVisuals";
export const CHART_DRAFT_APPEARANCE_KEYS = ["title", "caption", "description", "referenceLine", "xAxisTitle", "yAxisTitle", "valueFormat", "pieRotation", "pieGap", "pieValueMode", "donutHole", "donutLabel", "donutTotal", "lineWidth", "scatterLines", "lineStyle", "raceTop", "racePoster", "raceAnimate", "pictogramCount", "pictogramColumns", "pictogramShape", "histogramBins", "fontFamily", "fontScale", "pointSize", "areaOpacity", "barGap", "showGrid", "showAxisValues", "legendPosition", "scaleXMin", "scaleXMax", "scaleMin", "scaleMax"] as const;
export function chartDraftAppearance(chart: ChartData): Pick<ChartData, typeof CHART_DRAFT_APPEARANCE_KEYS[number]> {
  return Object.fromEntries(CHART_DRAFT_APPEARANCE_KEYS.map(key => [key, chart[key]])) as Pick<ChartData, typeof CHART_DRAFT_APPEARANCE_KEYS[number]>;
}
