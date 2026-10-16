import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
export function histogramObservationSource(source: string, header: boolean): { source: string; count: number } {
  const rows = parseDelimitedData(source, 51, 50).slice(header ? 1 : 0), values: number[] = [];
  for (const row of rows) for (const cell of row) {
    if (!cell.trim()) continue;
    const value = Number(cell);
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error("Use numeric observations within one trillion. Skip a header row if needed");
    values.push(value);
    if (values.length > 50) throw new Error("Use at most 50 observations");
  }
  if (!values.length) throw new Error("Paste at least one numeric observation");
  return { source: formatDelimitedData(values.map((value, index) => [`Observation ${index + 1}`, value]), "\t"), count: values.length };
}
