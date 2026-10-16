import { chartValueLabel } from "./chartValueFormat";
import type { ChartData } from "./dataVisuals";
export function histogramChartData(chart: ChartData): ChartData {
  const values = chart.rows.slice(0, 50).map(row => row.value).filter(Number.isFinite);
  if (!values.length) return { ...chart, kind: "column", rows: [], series: undefined };
  const lowest = Math.min(...values), highest = Math.max(...values), equal = lowest === highest;
  const bins = equal ? 1 : Math.max(1, Math.min(20, values.length, chart.histogramBins ?? 10)), spread = equal ? Math.max(1, Math.abs(lowest) * 0.1) : highest - lowest, lower = equal ? lowest - spread / 2 : lowest, step = spread / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const value of values) counts[Math.max(0, Math.min(bins - 1, Math.floor((value - lower) / step)))]++;
  const limit = (value: number) => chartValueLabel(Number(value.toPrecision(8)), chart.valueFormat);
  return { ...chart, kind: "column", rows: counts.map((value, index) => ({ label: limit(lower + index * step) + "–" + limit(lower + (index + 1) * step), value })), series: undefined, stacked: false, stackPercent: false, showLegend: false, referenceLine: undefined, valueFormat: undefined, colours: [chart.colours[0] || "#38bdf8"], barGap: chart.barGap ?? 0, showGrid: chart.showGrid ?? true, showAxisValues: chart.showAxisValues ?? true, xAxisTitle: chart.xAxisTitle ?? "Value range", yAxisTitle: chart.yAxisTitle ?? "Frequency" };
}
