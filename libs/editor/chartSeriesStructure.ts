import { parseChartSource } from "./chartSeries";
import { formatDelimitedData } from "./delimitedData";
import { chartCategoryColour } from "./chartCategoryColours";
export type ChartSeriesAction = "before" | "after" | "duplicate" | "delete" | "earlier" | "later";
export function editChartSeries(source: string, index: number, action: ChartSeriesAction) {
  const chart = parseChartSource(source, true), series = chart.series!;
  if (!Number.isInteger(index) || !series[index]) throw new Error("Choose an existing chart series");
  const inserting = ["before", "after", "duplicate"].includes(action);
  if (inserting && series.length >= 6) throw new Error("Use at most six data series");
  if (action === "delete" && series.length <= 1) throw new Error("Keep at least one data series");
  const entries = series.map((item, source) => ({ label: item.label, values: [...item.values], source: source as number | null }));
  let selected = index;
  if (inserting) {
    selected = action === "before" ? index : index + 1;
    const names = new Set(series.map(item => item.label.toLocaleLowerCase())), stem = action === "duplicate" ? series[index].label.slice(0, 180) + " copy" : "Series";
    let name = action === "duplicate" ? stem : `${stem} ${series.length + 1}`, suffix = 2;
    while (names.has(name.toLocaleLowerCase())) { name = `${stem} ${suffix}`; suffix++; }
    entries.splice(selected, 0, { label: name, values: action === "duplicate" ? [...series[index].values] : chart.rows.map(() => 0), source: null });
  } else if (action === "delete") { entries.splice(index, 1); selected = Math.min(index, entries.length - 1); }
  else {
    const next = index + (action === "earlier" ? -1 : 1); if (next < 0 || next >= entries.length) throw new Error("This series is already at the edge");
    [entries[index], entries[next]] = [entries[next], entries[index]]; selected = next;
  }
  return { selected, colourOrder: entries.map(item => item.source), source: formatDelimitedData([["Label", ...entries.map(item => item.label)], ...chart.rows.map((row, index) => [row.label, ...entries.map(item => item.values[index])])], "\t") };
}
export function chartSeriesEditColours(colours: readonly string[], order: readonly (number | null)[], fallback: readonly string[]): string[] {
  const used = new Set(order.filter((index): index is number => index !== null).map(index => chartCategoryColour(colours, index)));
  return order.map((source, index) => {
    if (source !== null) return chartCategoryColour(colours, source);
    const colour = fallback.find(colour => !used.has(colour)) ?? chartCategoryColour(fallback, index); used.add(colour); return colour;
  });
}
