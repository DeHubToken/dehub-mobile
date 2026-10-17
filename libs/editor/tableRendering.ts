import { drawGraphicText } from "./graphicText";
import { graphicFontCss } from "./graphicFonts";
import { chartValueLabel } from "./chartValueFormat";
import { tableTextLines } from "./tableTextLayout";
import type { DataVisualContext, TableData } from "./dataVisuals";

/** Weighted columns and rows keep a table's outer footprint fixed while its cells change. */
export function drawEditableTable(ctx: DataVisualContext, width: number, height: number, table: TableData): void {
  const family = graphicFontCss(table.fontFamily);
  const rows = table.rows.filter(Array.isArray).slice(0, 20), columns = Math.min(12, Math.max(1, ...rows.map(row => row.length)));
  if (!rows.length) return;
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, table.fontScale || 1));
  const columnWeights = Array.from({ length: columns }, (_, index) => Math.max(0.1, Math.min(10, table.columnWidths?.[index] || 1)));
  if (table.fitColumns) {
    const padding = table.padding === undefined ? font / 2 : table.padding / 1080 * height;
    for (let column = 0; column < columns; column++) {
      let measured = font * 3;
      rows.forEach((row, index) => {
        if ((table.merges ?? []).some(merge => merge.columnSpan > 1 && index >= merge.row && index < merge.row + merge.rowSpan && column >= merge.column && column < merge.column + merge.columnSpan)) return;
        const style = table.cellStyles?.[index + ":" + column], header = table.header && index === 0 || table.headerColumn && column === 0;
        ctx.font = (style?.italic ? "italic " : "") + (style?.bold === true ? "700 " : style?.bold === false ? "400 " : header ? "700 " : "500 ") + (font * (style?.fontScale ?? 1)) + "px " + family;
        const raw = String(row[column] ?? "");
        const text = (style?.numberFormat && raw.trim() && Number.isFinite(Number(raw)) ? chartValueLabel(Number(raw), style.numberFormat) : raw).slice(0, 200);
        for (const line of text.split(/\r?\n/)) measured = Math.max(measured, ctx.measureText(line).width + padding * 2);
      });
      columnWeights[column] = Math.max(1, Math.min(8, measured / (font * 3)));
    }
  }
  const rowWeights = rows.map((_, index) => Math.max(0.1, Math.min(10, table.rowHeights?.[index] || 1)));
  const columnTotal = columnWeights.reduce((sum, value) => sum + value, 0);
  const xs = [-width / 2], ys = [-height / 2];
  for (const weight of columnWeights) xs.push(xs[xs.length - 1] + width * weight / columnTotal);
  if (table.fitRows) rows.forEach((row, r) => {
    let needed = font * 1.2;
    for (let c = 0; c < columns; c++) {
      const merge = (table.merges ?? []).find(merge => r >= merge.row && r < merge.row + merge.rowSpan && c >= merge.column && c < merge.column + merge.columnSpan);
      if (merge && (merge.rowSpan > 1 || merge.column !== c)) continue;
      const cellWidth = xs[Math.min(columns, c + (merge?.columnSpan ?? 1))] - xs[c], padding = Math.min(table.padding === undefined ? font / 2 : table.padding / 1080 * height, cellWidth * 0.45);
      const style = table.cellStyles?.[r + ":" + c], header = table.header && r === 0 || table.headerColumn && c === 0;
      ctx.font = (style?.italic ? "italic " : "") + (style?.bold === true ? "700 " : style?.bold === false ? "400 " : header ? "700 " : "500 ") + (font * (style?.fontScale ?? 1)) + "px " + family;
      const raw = String(row[c] ?? ""), text = (style?.numberFormat && raw.trim() && Number.isFinite(Number(raw)) ? chartValueLabel(Number(raw), style.numberFormat) : raw).slice(0, 200);
      const lines = tableTextLines(text, Math.max(1, cellWidth - padding * 2), value => ctx.measureText(value).width, !!table.wrap);
      needed = Math.max(needed, Math.min(8, lines.length) * font * (style?.fontScale ?? 1) * 1.2 + padding * 2);
    }
    rowWeights[r] = Math.max(1, Math.min(10, needed / (font * 1.2)));
  });
  const rowTotal = rowWeights.reduce((sum, value) => sum + value, 0);
  for (const weight of rowWeights) ys.push(ys[ys.length - 1] + height * weight / rowTotal);
  const merges = (table.merges ?? []).slice(0, 120).filter(merge => [merge.row, merge.column, merge.rowSpan, merge.columnSpan].every(Number.isInteger) && merge.row >= 0 && merge.column >= 0 && merge.rowSpan >= 1 && merge.columnSpan >= 1 && merge.row + merge.rowSpan <= rows.length && merge.column + merge.columnSpan <= columns);
  ctx.textBaseline = "middle"; ctx.lineWidth = Math.max(1, width / 700) * (table.borderWidth ?? 1);
  rows.forEach((row, r) => {
    for (let c = 0; c < columns; c++) {
      const merge = merges.find(merge => r >= merge.row && r < merge.row + merge.rowSpan && c >= merge.column && c < merge.column + merge.columnSpan);
      if (merge && (merge.row !== r || merge.column !== c)) continue;
      const x = xs[c], y = ys[r], cellWidth = xs[c + (merge?.columnSpan ?? 1)] - x, cellHeight = ys[r + (merge?.rowSpan ?? 1)] - y;
      const padding = Math.min(table.padding === undefined ? font / 2 : table.padding / 1080 * height, cellWidth * 0.45, cellHeight * 0.4);
      let size = Math.max(1, Math.min(font * (table.cellStyles?.[r + ":" + c]?.fontScale ?? 1), cellHeight - padding * 2)), lineHeight = size * 1.2;
      const maxWidth = Math.max(1, cellWidth - padding * 2);
      const cellStyle = table.cellStyles?.[r + ":" + c], alignment = cellStyle?.align ?? table.align ?? "left", header = !!(table.header && r === 0 || table.headerColumn && c === 0), stripeIndex = table.stripeAxis === "column" ? c : r, stripeHeader = table.stripeAxis === "column" ? table.headerColumn : table.header;
      ctx.fillStyle = cellStyle?.fill ?? (header ? table.headerColour : table.stripeColour && stripeIndex % 2 === (stripeHeader ? 0 : 1) ? table.stripeColour : table.cellColour);
      ctx.fillRect(x, y, cellWidth, cellHeight); ctx.strokeStyle = table.borderColour;
      if ((table.borderWidth ?? 1) > 0) ctx.strokeRect(x, y, cellWidth, cellHeight);
      const fontStyle = (cellStyle?.italic ? "italic " : "") + (cellStyle?.bold === true ? "700 " : cellStyle?.bold === false ? "400 " : header ? "700 " : "500 ");
      ctx.font = fontStyle + size + "px " + family;
      ctx.fillStyle = cellStyle?.colour ?? (header ? table.headerTextColour : table.textColour);
      ctx.textAlign = alignment === "centre" ? "center" : alignment;
      const raw = String(row[c] ?? "");
      const text = (cellStyle?.numberFormat && raw.trim() && Number.isFinite(Number(raw)) ? chartValueLabel(Number(raw), cellStyle.numberFormat) : raw).slice(0, 200), measure = (value: string) => ctx.measureText(value).width;
      let fullLines = tableTextLines(text, maxWidth, measure, !!table.wrap);
      if (table.fitText) {
        const minimumSize = Math.max(1, size * 0.35);
        for (let attempt = 0; attempt < 8 && size > minimumSize && (fullLines.length > (table.wrap ? 8 : 1) || (fullLines.length - 1) * lineHeight + size > cellHeight - padding * 2 || fullLines.some(line => measure(line) > maxWidth)); attempt++) {
          size = Math.max(minimumSize, size * 0.85); lineHeight = size * 1.2; ctx.font = fontStyle + size + "px " + family;
          fullLines = tableTextLines(text, maxWidth, measure, !!table.wrap);
        }
      }
      const maxLines = table.wrap ? Math.max(1, Math.min(8, Math.floor((cellHeight - padding * 2) / lineHeight))) : 1;
      const lines = fullLines.slice(0, maxLines), clipped = fullLines.length > maxLines;
      if (clipped) lines[lines.length - 1] += "…";
      const anchor = alignment === "centre" ? x + cellWidth / 2 : alignment === "right" ? x + cellWidth - padding : x + padding;
      const block = (lines.length - 1) * lineHeight + size;
      const vertical = cellStyle?.verticalAlign ?? table.verticalAlign;
      const firstY = vertical === "top" ? y + padding + size / 2 : vertical === "bottom" ? y + cellHeight - padding - block + size / 2 : y + cellHeight / 2 - (lines.length - 1) * lineHeight / 2;
      lines.forEach((value, index) => {
        let label = value;
        while (label.length > 1 && ctx.measureText(label).width > maxWidth) label = label.slice(0, -2) + "…";
        if (!clipped || index < maxLines) drawGraphicText(ctx,label, anchor, firstY + index * lineHeight);
      });
    }
  });
}
