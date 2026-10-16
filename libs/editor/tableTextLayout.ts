export function tableTextLines(text: string, width: number, measure: (text: string) => number, wrap: boolean): string[] {
  if (!wrap) return [text.replace(/\s+/g, " ")];
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(text.replace(/\r\n?/g, "\n").slice(0, 200))) {
    if (char === "\n") { lines.push(line); line = ""; continue; }
    if (line && measure(line + char) > width) {
      const space = line.lastIndexOf(" ");
      if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
      else { lines.push(line); line = char; }
      while (Array.from(line).length > 1 && measure(line) > width) { const letters = Array.from(line); let split = 1; while (split < letters.length && measure(letters.slice(0, split + 1).join("")) <= width) split++; lines.push(letters.slice(0, split).join("")); line = letters.slice(split).join(""); }
    } else line += char;
  }
  lines.push(line); return lines;
}
