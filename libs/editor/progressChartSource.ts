import { parseChartSource } from "./chartSeries";
import { formatDelimitedData } from "./delimitedData";
export function setProgressChartSource(source: string, multiple: boolean, percentage: number): string {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error("Use a progress value from 0 to 100");
  const parsed = parseChartSource(source, multiple);
  if (!parsed.rows.length) throw new Error("Add at least one data row before setting progress");
  const value = Number(percentage.toFixed(1)), series = parsed.series?.map((series, index) => ({ ...series, values: series.values.map((old, row) => !index && !row ? value : old) }));
  const rows = parsed.rows.map((row, index) => [row.label, ...(series?.map(series => series.values[index]) ?? [index ? row.value : value])]);
  return formatDelimitedData(series ? [["Label", ...series.map(series => series.label)], ...rows] : rows, "\t");
}
