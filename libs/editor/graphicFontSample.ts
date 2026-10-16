import { chartValueLabel } from "./chartValueFormat";
import type { ChartData, TableData } from "./dataVisuals";
export function graphicFontSample(graphic: ChartData | TableData): string {
  const labels = "kind" in graphic ? [chartValueLabel(1234567890, graphic.valueFormat), graphic.xAxisTitle, graphic.yAxisTitle, graphic.donutLabel, graphic.referenceLine?.label, ...(graphic.series?.map(series => series.label) ?? []), ...graphic.rows.flatMap(row => [row.label, String(row.value)])] : [...Object.values(graphic.cellStyles ?? {}).flatMap(style => style.numberFormat ? [chartValueLabel(1234567890, style.numberFormat)] : []), ...graphic.rows.flat()];
  return labels.filter(Boolean).join(" ").slice(0, 1000) || "Design";
}
