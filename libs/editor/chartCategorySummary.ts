import { parseChartSource } from "./chartSeries";
import { formatDelimitedData } from "./delimitedData";

export const CHART_CATEGORY_REDUCERS = ["sum", "average", "count", "minimum", "maximum"] as const;
export type ChartCategoryReducer = typeof CHART_CATEGORY_REDUCERS[number];
export interface ChartCategorySummary { source: string; order: number[]; original: number; categories: number; repeated: number }

export function summarizeChartCategories(source: string, multiple: boolean, reducer: ChartCategoryReducer, trim: boolean, caseSensitive: boolean): ChartCategorySummary {
  const parsed = parseChartSource(source, multiple);
  if (!parsed.rows.length) throw new Error("Add chart data before summarizing categories");
  const series = parsed.series ?? [{ label: "Value", values: parsed.rows.map(row => row.value) }];
  const groups = new Map<string, { label: string; first: number; indices: number[] }>();
  parsed.rows.forEach((row, index) => {
    const label = trim ? row.label.trim() : row.label, key = caseSensitive ? label : label.toLowerCase();
    if (!label.trim()) throw new Error("Give every category a nonempty label");
    const group = groups.get(key);
    if (group) group.indices.push(index); else groups.set(key, { label, first: index, indices: [index] });
  });
  const ordered = [...groups.values()];
  const rows = ordered.map(group => [group.label, ...series.map(set => {
    const values = group.indices.map(index => set.values[index]);
    const sum = values.reduce((total, value) => total + value, 0);
    const result = reducer === "count" ? values.length : reducer === "minimum" ? Math.min(...values) : reducer === "maximum" ? Math.max(...values) : reducer === "average" ? values.reduce((mean, value) => mean + value / values.length, 0) : sum;
    if (!Number.isFinite(result) || Math.abs(result) > 1e12) throw new Error(`The summarized value for ${group.label} exceeds one trillion`);
    return result;
  })]);
  return { source: formatDelimitedData(multiple ? [["Label", ...series.map(set => set.label)], ...rows] : rows, "\t"), order: ordered.map(group => group.first), original: parsed.rows.length, categories: ordered.length, repeated: ordered.filter(group => group.indices.length > 1).length };
}
