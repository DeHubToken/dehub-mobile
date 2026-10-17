import { chartDataSource, parseChartSource } from "./chartSeries";
import { DEFAULT_CHART } from "./dataVisualProject";
import { parseTableData } from "./dataVisuals";
import { formatDelimitedData } from "./delimitedData";
export function convertDataVisualSource(source: string, from: "chart" | "table", multiple: boolean, header: boolean, xAxisTitle = "") {
  if (from === "chart") {
    const chart = parseChartSource(source, multiple), series = chart.series ?? [{ label: "Value", values: chart.rows.map(row => row.value) }];
    if (chart.rows.length > 19) throw new Error("Convert up to 19 chart data rows so the table and its header fit within 20 rows");
    const rows = [[xAxisTitle.trim().slice(0, 200) || "Label", ...series.map(item => item.label)], ...chart.rows.map((row, index) => [row.label, ...series.map(item => String(item.values[index]))])];
    return { mode: "table" as const, source: formatDelimitedData(rows, "\t"), multiple: false, header: true, xAxisTitle: undefined };
  }
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (columns < 2 || columns > 7) throw new Error("Convert a table with a label column and one to six numeric columns");
  const names = header ? rows[0] : undefined, data = header ? rows.slice(1) : rows;
  if (!data.length) throw new Error("Add a data row beneath the table header before converting");
  const used = new Set<string>(), labels = Array.from({ length: columns - 1 }, (_, index) => {
    const stem = names?.[index + 1]?.trim().slice(0, 180) || `Series ${index + 1}`; let name = stem, suffix = 2;
    while (used.has(name.toLocaleLowerCase())) name = `${stem} ${suffix++}`; used.add(name.toLocaleLowerCase()); return name;
  });
  const chartSource = formatDelimitedData([["Label", ...labels], ...data.map(row => Array.from({ length: columns }, (_, index) => row[index] ?? ""))], "\t");
  const chart = parseChartSource(chartSource, true), useMultiple = header || columns > 2;
  return { mode: "chart" as const, source: chartDataSource({ ...DEFAULT_CHART, ...chart }, useMultiple), multiple: useMultiple, header: false, xAxisTitle: names?.[0]?.trim().slice(0, 100) || undefined };
}
