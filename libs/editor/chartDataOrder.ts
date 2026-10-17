import { chartXValue } from "./chartDateAxis";
import { chartCategoryColour } from "./chartCategoryColours";
import { parseChartSource } from "./chartSeries";
import { formatDelimitedData } from "./delimitedData";

export type ChartOrderTarget = "label" | "x" | "total" | number;
export function orderChartSource(source: string, multiple: boolean, target: ChartOrderTarget, descending: boolean, reverse = false, xAxisMode?: "number" | "date"): { source: string; order: number[] } {
  const parsed = parseChartSource(source, multiple), count = parsed.rows.length;
  if (!count) throw new Error("Add chart data before changing its order");
  const series = parsed.series ?? [{ label: "Value", values: parsed.rows.map(row => row.value) }];
  if (typeof target === "number" && (!Number.isInteger(target) || !series[target])) throw new Error("Choose an existing data series");
  if (!reverse && target === "x" && parsed.rows.some(row => !Number.isFinite(chartXValue(row.label, xAxisMode)))) throw new Error(xAxisMode === "date" ? "Use valid ISO dates or UTC timestamps before sorting by X" : "Use numeric X coordinates within one trillion before sorting by X");
  const order = Array.from({ length: count }, (_, index) => index);
  if (reverse) order.reverse();
  else order.sort((a, b) => {
    const comparison = target === "x" ? chartXValue(parsed.rows[a].label, xAxisMode) - chartXValue(parsed.rows[b].label, xAxisMode) : target === "label" ? parsed.rows[a].label.localeCompare(parsed.rows[b].label, undefined, { numeric: true, sensitivity: "base" }) : target === "total" ? series.reduce((sum, set) => sum + set.values[a] - set.values[b], 0) : series[target].values[a] - series[target].values[b];
    return (descending ? -comparison : comparison) || a - b;
  });
  const rows = order.map(index => [parsed.rows[index].label, ...series.map(set => set.values[index])]);
  return { source: formatDelimitedData(multiple ? [["Label", ...series.map(set => set.label)], ...rows] : rows, "\t"), order };
}
export function reorderChartCategoryColours(colours: readonly string[], order: readonly number[]): string[] {
  return order.map(index => chartCategoryColour(colours, index));
}
