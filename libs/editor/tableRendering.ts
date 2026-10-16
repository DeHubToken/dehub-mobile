import type { DataVisualContext, TableData } from "./dataVisuals";

/** Weighted columns and rows keep a table's outer footprint fixed while its cells change. */
export function drawEditableTable(ctx: DataVisualContext, width: number, height: number, table: TableData): void {
  const rows = table.rows.filter(Array.isArray).slice(0, 20), columns = Math.min(12, Math.max(1, ...rows.map(row => row.length)));
  if (!rows.length) return;
  const columnWeights = Array.from({ length: columns }, (_, index) => Math.max(0.1, Math.min(10, table.columnWidths?.[index] || 1)));
  const rowWeights = rows.map((_, index) => Math.max(0.1, Math.min(10, table.rowHeights?.[index] || 1)));
  const columnTotal = columnWeights.reduce((sum, value) => sum + value, 0), rowTotal = rowWeights.reduce((sum, value) => sum + value, 0);
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, table.fontScale || 1));
  const xs = [-width / 2], ys = [-height / 2];
  for (const weight of columnWeights) xs.push(xs[xs.length - 1] + width * weight / columnTotal);
  for (const weight of rowWeights) ys.push(ys[ys.length - 1] + height * weight / rowTotal);
  const merges = (table.merges ?? []).slice(0, 120).filter(merge => [merge.row, merge.column, merge.rowSpan, merge.columnSpan].every(Number.isInteger) && merge.row >= 0 && merge.column >= 0 && merge.rowSpan >= 1 && merge.columnSpan >= 1 && merge.row + merge.rowSpan <= rows.length && merge.column + merge.columnSpan <= columns);
  ctx.textBaseline = "middle"; ctx.lineWidth = Math.max(1, width / 700) * (table.borderWidth ?? 1);
  rows.forEach((row, r) => {
    for (let c = 0; c < columns; c++) {
      const merge = merges.find(merge => r >= merge.row && r < merge.row + merge.rowSpan && c >= merge.column && c < merge.column + merge.columnSpan);
      if (merge && (merge.row !== r || merge.column !== c)) continue;
      const x = xs[c], y = ys[r], cellWidth = xs[c + (merge?.columnSpan ?? 1)] - x, cellHeight = ys[r + (merge?.rowSpan ?? 1)] - y;
      const padding = Math.min(table.padding === undefined ? font / 2 : table.padding / 1080 * height, cellWidth * 0.45, cellHeight * 0.4);
      const size = Math.max(1, Math.min(font, cellHeight - padding * 2)), lineHeight = size * 1.2, maxWidth = Math.max(1, cellWidth - padding * 2);
      const cellStyle = table.cellStyles?.[r + ":" + c], alignment = cellStyle?.align ?? table.align ?? "left";
      ctx.fillStyle = cellStyle?.fill ?? (table.header && r === 0 ? table.headerColour : table.stripeColour && r % 2 === (table.header ? 0 : 1) ? table.stripeColour : table.cellColour);
      ctx.fillRect(x, y, cellWidth, cellHeight); ctx.strokeStyle = table.borderColour;
      if ((table.borderWidth ?? 1) > 0) ctx.strokeRect(x, y, cellWidth, cellHeight);
      ctx.font = (cellStyle?.italic ? "italic " : "") + (cellStyle?.bold === true ? "700 " : cellStyle?.bold === false ? "400 " : table.header && r === 0 ? "700 " : "500 ") + size + "px Inter, sans-serif";
      ctx.fillStyle = cellStyle?.colour ?? (table.header && r === 0 ? table.headerTextColour : table.textColour);
      ctx.textAlign = alignment === "centre" ? "center" : alignment;
      const maxLines = table.wrap ? Math.max(1, Math.min(8, Math.floor((cellHeight - padding * 2) / lineHeight))) : 1;
      const text = String(row[c] || "").slice(0, 200), lines: string[] = [];
      let line = "", clipped = false;
      if (table.wrap) {
        const letters = Array.from(text);
        for (let index = 0; index < letters.length; index++) {
          const char = letters[index];
          if (char === "\n" || (line && ctx.measureText(line + char).width > maxWidth)) {
            if (lines.length + 1 >= maxLines) { line += "…"; clipped = true; break; }
            const space = char === "\n" ? -1 : line.lastIndexOf(" ");
            if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
            else { lines.push(line); line = char === "\n" ? "" : char; }
          } else line += char;
        }
      } else line = text.replace(/\s+/g, " ");
      lines.push(line);
      const anchor = alignment === "centre" ? x + cellWidth / 2 : alignment === "right" ? x + cellWidth - padding : x + padding;
      const block = (lines.length - 1) * lineHeight + size;
      const firstY = table.verticalAlign === "top" ? y + padding + size / 2 : table.verticalAlign === "bottom" ? y + cellHeight - padding - block + size / 2 : y + cellHeight / 2 - (lines.length - 1) * lineHeight / 2;
      lines.forEach((value, index) => {
        let label = value;
        while (label.length > 1 && ctx.measureText(label).width > maxWidth) label = label.slice(0, -2) + "…";
        if (!clipped || index < maxLines) ctx.fillText(label, anchor, firstY + index * lineHeight);
      });
    }
  });
}
