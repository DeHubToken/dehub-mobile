import { parseChartSource } from "./chartSeries";
import { parseTableData } from "./dataVisuals";
import { formatDelimitedData, parseDelimitedData } from "./delimitedData";

export function dataVisualExport(source: string, mode: "chart" | "table", multiple: boolean, delimiter: "," | "\t", formulasAsText = true): string {
  let rows: (string | number)[][];
  if (mode === "table") rows = parseTableData(source);
  else {
    const chart = parseChartSource(source, multiple);
    rows = chart.series?.length
      ? [[parseDelimitedData(source, 51, 7)[0]?.[0] || "Label", ...chart.series.map(series => series.label)], ...chart.rows.map((row, index) => [row.label, ...chart.series!.map(series => series.values[index])])]
      : chart.rows.map(row => [row.label, row.value]);
  }
  if (!rows.length) throw new Error("Enter at least one data row before exporting");
  const safe = (value: string | number) => {
    if (!formulasAsText || typeof value !== "string" || !/^[\u0000-\u0020]*[=+@-]/.test(value)) return value;
    if (value.trim() !== "" && Number.isFinite(Number(value))) return value;
    return "'" + value;
  };
  return formatDelimitedData(rows.map(row => row.map(safe)), delimiter);
}
