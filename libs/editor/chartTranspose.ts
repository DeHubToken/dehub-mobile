import { parseChartSource } from "./chartSeries";
import { formatDelimitedData } from "./delimitedData";
export function transposeChartSource(source: string, multiple: boolean): string {
  const chart = parseChartSource(source, multiple);
  if (chart.rows.length > 6) throw new Error("Switch rows and columns with up to six categories. Each category becomes a data series.");
  const series = chart.series ?? [{ label: "Series 1", values: chart.rows.map(row => row.value) }];
  const used = new Set<string>();
  const names = chart.rows.map(row => {
    const stem = row.label.trim().slice(0, 180) || "Series";
    let name = stem, suffix = 2;
    while (used.has(name.toLocaleLowerCase())) name = `${stem} ${suffix++}`;
    used.add(name.toLocaleLowerCase()); return name;
  });
  return formatDelimitedData([["Label", ...names], ...series.map(item => [item.label, ...item.values])], "\t");
}
