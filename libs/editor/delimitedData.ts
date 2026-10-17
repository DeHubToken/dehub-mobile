/** Bounded CSV/TSV parser with quoted cells, embedded line breaks, and escaped quotes. */
export function parseDelimitedData(source: string, maxRows: number, maxColumns: number, separator?: "," | "\t" | ";"): string[][] {
  if (source.length > 500000) throw new Error("Pasted data is too large");
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  // A tab outside quoted cells identifies spreadsheet TSV; quoted tabs in CSV stay literal.
  let quoted = false, delimiter = separator ?? ",";
  for (let i = 0; !separator && i < text.length; i++) {
    if (text[i] === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && text[i] === "\t") { delimiter = "\t"; break; }
  }
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQuotes = false, closedQuote = false, cellQuoted = false, rowQuoted = false;
  const endCell = () => { row.push(cellQuoted ? cell : cell.trim()); rowQuoted = rowQuoted || cellQuoted; cell = ""; cellQuoted = false; closedQuote = false; if (row.length > maxColumns) throw new Error(`Use at most ${maxColumns} columns`); };
  const endRow = () => {
    endCell();
    if (row.some(value => value.length) || row.length > 1 || rowQuoted) { rows.push(row); if (rows.length > maxRows) throw new Error(`Use at most ${maxRows} rows`); }
    row = []; rowQuoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { inQuotes = false; closedQuote = true; }
      else cell += char;
    } else if (char === delimiter) endCell();
    else if (char === "\n") endRow();
    else if (char === '"' && !cell.trim() && !closedQuote) { cell = ""; inQuotes = true; cellQuoted = true; }
    else if (closedQuote) { if (char.trim()) throw new Error("Separate quoted cells with commas or tabs"); }
    else cell += char;
  }
  if (inQuotes) throw new Error("Close the quoted cell before applying this data");
  if (cell.length || row.length || closedQuote) endRow();
  return rows;
}

export function formatDelimitedData(rows: readonly (readonly (string | number)[])[], delimiter = ","): string {
  const encode = (value: string | number) => {
    const text = String(value);
    return !text || /[",\t\r\n]/.test(text) || text.trim() !== text ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return rows.map(row => row.map(encode).join(delimiter)).join("\n");
}
