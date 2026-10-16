import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
import { parseChartData, type ChartData } from "./dataVisuals";

export function chartDataSource(chart: ChartData, multiple = !!chart.series?.length): string {
  if (!multiple) return formatDelimitedData(chart.rows.map(row => [row.label, row.value]));
  const series = chart.series?.length ? chart.series : [{ label: "Series 1", values: chart.rows.map(row => row.value) }];
  return formatDelimitedData([["Label", ...series.map(item => item.label)], ...chart.rows.map((row, index) => [row.label, ...series.map(item => item.values[index])])], "\t");
}

export function parseChartSource(text: string, multiple: boolean): Pick<ChartData, "rows" | "series"> {
  if (!multiple) return { rows: parseChartData(text), series: undefined };
  const [head, ...data] = parseDelimitedData(text, 51, 7);
  if (!head || head.length < 2 || !data.length) throw new Error("Add column names in the first row, followed by label and numeric values");
  const labels = head.slice(1).map(value => value.trim());
  if (labels.some(value => !value || value.length > 200) || new Set(labels).size !== labels.length) throw new Error("Give each data series a unique name of up to 200 characters");
  if (data.some(row => row.length !== head.length || !row[0] || row[0].length > 200 || row.slice(1).some(raw => !raw.trim() || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 1e12))) throw new Error("Each data row needs a label and one number for every series");
  return { rows: data.map(row => ({ label: row[0], value: Number(row[1]) })), series: labels.map((label, index) => ({ label, values: data.map(row => Number(row[index + 1])) })) };
}
