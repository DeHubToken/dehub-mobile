import { filterChartData } from "./chartRowFilters";
import { chartXLabel, chartXValue } from "./chartDateAxis";
import { chartValueLabel } from "./chartValueFormat";
import type { ChartData, TableData } from "./dataVisuals";
export function graphicFontSample(graphic: ChartData | TableData): string {
  if ("kind" in graphic) graphic = filterChartData(graphic);
  const labels = "kind" in graphic ? [chartValueLabel(1234567890, graphic.valueFormat), chartValueLabel(1234567890, graphic.xValueFormat), graphic.xAxisTitle, graphic.yAxisTitle, graphic.donutLabel, graphic.referenceLine?.label, ...(graphic.series?.map(series => series.label) ?? []), ...graphic.rows.flatMap(row => [row.label, String(row.value), ...(graphic.xAxisMode === "date" ? [chartXLabel(chartXValue(row.label, "date"), graphic)] : [])])] : [...Object.values(graphic.cellStyles ?? {}).flatMap(style => style.numberFormat ? [chartValueLabel(1234567890, style.numberFormat)] : []), ...graphic.rows.flat()];
  return ["0123456789.,%+−()/:", graphic.title, graphic.caption, ...labels].filter(Boolean).join(" ").slice(0, 1000) || "Design";
}
