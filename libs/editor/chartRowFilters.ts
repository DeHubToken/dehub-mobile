import type { ChartData } from "./dataVisuals";
export type ChartRowFilter = { enabled?: boolean } & (
  { kind: "label"; operator: "contains" | "equals" | "excludes" | "starts" | "ends"; text: string; caseSensitive?: boolean }
  | { kind: "value"; target: "first" | "total" | "series"; series?: string; minimum?: number; maximum?: number }
  | { kind: "rows"; first: number; last: number }
);
export function validChartRowFilters(value: unknown): value is ChartRowFilter[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 3) return false;
  return value.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || item.enabled !== undefined && typeof item.enabled !== "boolean") return false;
    if (item.kind === "label") return ["contains", "equals", "excludes", "starts", "ends"].includes(item.operator) && typeof item.text === "string" && item.text.length <= 200 && (item.caseSensitive === undefined || typeof item.caseSensitive === "boolean");
    if (item.kind === "rows") return Number.isInteger(item.first) && Number.isInteger(item.last) && item.first >= 1 && item.last <= 50 && item.first <= item.last;
    if (item.kind !== "value" || !["first", "total", "series"].includes(item.target) || item.target === "series" && (typeof item.series !== "string" || !item.series.trim() || item.series.length > 200)) return false;
    return [item.minimum, item.maximum].every(bound => bound === undefined || typeof bound === "number" && Number.isFinite(bound) && Math.abs(bound) <= 1e13) && !(item.minimum !== undefined && item.maximum !== undefined && item.minimum > item.maximum);
  });
}
export function supportsChartRowFilters(chart: Pick<ChartData, "kind" | "pictogramMode">): boolean {
  return !["progress-bar", "progress-ring", "radial-progress", "progress-dial"].includes(chart.kind) && !(chart.kind === "pictogram" && chart.pictogramMode === "progress");
}
export function chartFilteredIndices(chart: Pick<ChartData, "rows" | "series" | "filters">): number[] {
  const filters = validChartRowFilters(chart.filters) ? chart.filters ?? [] : [];
  return chart.rows.slice(0, 50).flatMap((row, index) => filters.every(filter => {
    if (filter.enabled === false) return true;
    if (filter.kind === "rows") return index + 1 >= filter.first && index + 1 <= filter.last;
    if (filter.kind === "label") {
      const label = filter.caseSensitive ? row.label.trim() : row.label.trim().toLowerCase(), text = filter.caseSensitive ? filter.text.trim() : filter.text.trim().toLowerCase();
      if (!text) return true;
      return filter.operator === "equals" ? label === text : filter.operator === "excludes" ? !label.includes(text) : filter.operator === "starts" ? label.startsWith(text) : filter.operator === "ends" ? label.endsWith(text) : label.includes(text);
    }
    const matchingSeries = filter.target === "series" ? chart.series?.filter(series => series.label === filter.series) ?? [] : [], series = matchingSeries[0];
    if (filter.target === "series" && matchingSeries.length !== 1) return true;
    const number = filter.target === "total" ? chart.series?.reduce((total, series) => total + series.values[index], 0) ?? row.value : filter.target === "series" ? series!.values[index] : row.value;
    return (filter.minimum === undefined || number >= filter.minimum) && (filter.maximum === undefined || number <= filter.maximum);
  }) ? [index] : []);
}
export function filterChartData(chart: ChartData): ChartData {
  if (!validChartRowFilters(chart.filters) || !supportsChartRowFilters(chart) || !chart.filters?.some(filter => filter.enabled !== false)) return chart;
  const indices = chartFilteredIndices(chart), categoryColours = (!chart.series?.length && chart.kind !== "radar") || ["pie", "donut", "race", "funnel", "treemap", "packed-circles", "pictogram", "bubble"].includes(chart.kind);
  return { ...chart, filters: undefined, rows: indices.map(index => chart.rows[index]), series: chart.series?.map(series => ({ ...series, values: indices.map(index => series.values[index]) })), colours: categoryColours && indices.length ? indices.map(index => chart.colours[index % Math.max(1, chart.colours.length)] ?? "#38bdf8") : chart.colours };
}
export function chartRowFilterDraft(kind: "label" | "value" | "rows", options: { operator: "contains" | "equals" | "excludes" | "starts" | "ends"; text: string; caseSensitive: boolean; target: "first" | "total" | "series"; series?: string; minimum: string; maximum: string; first: string; last: string; enabled: boolean }): ChartRowFilter {
  const number = (value: string) => value.trim() ? Number(value.replace(",", ".")) : undefined;
  const filter: ChartRowFilter = kind === "label" ? { kind, operator: options.operator, text: options.text, caseSensitive: options.caseSensitive, enabled: options.enabled } : kind === "rows" ? { kind, first: Number(options.first), last: Number(options.last), enabled: options.enabled } : { kind, target: options.target, series: options.target === "series" ? options.series : undefined, minimum: number(options.minimum), maximum: number(options.maximum), enabled: options.enabled };
  if (!validChartRowFilters([filter])) throw new Error(kind === "rows" ? "Choose a source-row range from 1 to 50" : kind === "value" ? "Choose a data series and ordered numeric bounds within ten trillion, or leave bounds blank" : "Use a label condition up to 200 characters");
  return filter;
}
