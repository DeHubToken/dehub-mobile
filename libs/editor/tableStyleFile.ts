import { validDataVisuals, type TableData } from "./dataVisuals";
export type PortableTableStyle = Pick<TableData, "header" | "headerColumn" | "stripeAxis" | "headerColour" | "headerTextColour" | "cellColour" | "textColour" | "borderColour" | "stripeColour" | "align" | "borderWidth" | "padding" | "fontFamily" | "fontScale" | "verticalAlign" | "wrap" | "fitRows" | "fitColumns" | "fitText">;
export function captureTableStyle(table: TableData): PortableTableStyle {
  const style = { header: table.header, headerColumn: table.headerColumn, stripeAxis: table.stripeAxis, headerColour: table.headerColour, headerTextColour: table.headerTextColour, cellColour: table.cellColour, textColour: table.textColour, borderColour: table.borderColour, stripeColour: table.stripeColour, align: table.align, borderWidth: table.borderWidth, padding: table.padding, fontFamily: table.fontFamily, fontScale: table.fontScale, verticalAlign: table.verticalAlign, wrap: table.wrap, fitRows: table.fitRows, fitColumns: table.fitColumns, fitText: table.fitText };
  if (!validDataVisuals({ table: { ...style, rows: [["Sample"]] } })) throw new Error("Choose valid table formatting before exporting its style");
  return style;
}
export function tableStyleFile(table: TableData, name: string): string {
  return JSON.stringify({ kind: "dehub-table-style", version: 1, name: name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Table style", style: captureTableStyle(table) }) + "\n";
}
export function parseTableStyleFile(text: string): { name: string; style: PortableTableStyle } {
  if (text.length > 32768) throw new Error("Choose a table-style file smaller than 32 KB");
  let raw: unknown; try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("Choose an exported table-style JSON file"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Choose an exported table-style file");
  const file = raw as Record<string, unknown>;
  if (file.kind !== "dehub-table-style" || file.version !== 1 || typeof file.name !== "string" || !file.style || typeof file.style !== "object" || Array.isArray(file.style)) throw new Error("Choose a supported table-style file");
  const style = captureTableStyle({ ...(file.style as PortableTableStyle), rows: [["Sample"]] });
  return { name: file.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Table style", style };
}
export function tableStylePalette(style: PortableTableStyle): string[] { return [...new Set([style.headerColour, style.headerTextColour, style.cellColour, style.textColour, style.borderColour, ...(style.stripeColour ? [style.stripeColour] : [])])]; }
