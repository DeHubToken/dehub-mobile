import { wrapTextParagraph } from "./textParagraphWrap";
export function balancedTextParagraph(paragraph: string, available: number, measure: (value: string) => number): { lines: string[]; offsets: number[] } {
  const natural = wrapTextParagraph(paragraph, available, measure, false);
  if (paragraph.length > 600) return natural;
  const words = paragraph.trim().split(/\s+/).filter(Boolean), count = natural.lines.length;
  if (count < 2 || count > 6 || words.length > 80 || words.length < count) return natural;
  const widths = words.map(measure), space = measure(" ");
  if (widths.some(width => width > available)) return natural;
  const totals = [0]; for (const width of widths) totals.push(totals[totals.length - 1] + width);
  const costs: number[][] = Array.from({ length: count + 1 }, () => Array(words.length + 1).fill(Infinity));
  const previous: number[][] = Array.from({ length: count + 1 }, () => Array(words.length + 1).fill(-1));
  costs[0][0] = 0;
  for (let line = 1; line <= count; line++) for (let end = line; end <= words.length; end++) {
    for (let start = end - 1; start >= line - 1; start--) {
      const width = totals[end] - totals[start] + (end - start - 1) * space;
      if (width > available + 0.01) break;
      const candidate = costs[line - 1][start] + (available - width) ** 2;
      if (candidate < costs[line][end]) { costs[line][end] = candidate; previous[line][end] = start; }
    }
  }
  if (!Number.isFinite(costs[count][words.length])) return natural;
  const lines: string[] = [];
  let end = words.length;
  for (let line = count; line > 0; line--) { const start = previous[line][end]; if (start < 0) return natural; lines.unshift(words.slice(start, end).join(" ")); end = start; }
  if (lines.some(line => measure(line) > available + 0.01)) return natural;
  return { lines, offsets: lines.map(() => 0) };
}
