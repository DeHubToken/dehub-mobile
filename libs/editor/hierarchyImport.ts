import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
import { treemapDataError } from "./treemapChart";
export function hierarchyImportSource(source: string, header: boolean): { source: string; count: number } {
  const rows = parseDelimitedData(source, 51, 7).slice(header ? 1 : 0);
  if (!rows.length || rows.length > 50) throw new Error("Use one to fifty hierarchy data rows");
  const result = rows.map(row => {
    if (row.length < 2) throw new Error("Use one to six category columns followed by a numeric size column");
    const names = row.slice(0, -1).map(name => name.trim()), raw = row[row.length - 1].trim(), value = Number(raw);
    if (names.some(name => !name || name.includes("/"))) throw new Error("Fill each category cell and keep / out of category names");
    const label = names.join(" / ");
    if (label.length > 200) throw new Error("Keep the combined category path within 200 characters");
    if (!raw || !Number.isFinite(value) || value < 0 || value > 1e12) throw new Error("Use nonnegative numeric sizes within one trillion in the final column");
    return { label, value };
  });
  const error = treemapDataError(result);
  if (error) throw new Error(error);
  return { source: formatDelimitedData(result.map(row => [row.label, row.value]), "\t"), count: result.length };
}
