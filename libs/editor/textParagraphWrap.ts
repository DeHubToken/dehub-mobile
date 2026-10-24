function paragraphGraphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(value: string): Iterable<{ segment: string }> } }).Segmenter;
  return Segmenter ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value), part => part.segment) : Array.from(value);
}

/** Keep a list marker with its first word and indent continuation lines beneath the text. */
export function wrapTextParagraph(paragraph: string, available: number, measure: (value: string) => number, hanging: boolean): { lines: string[]; offsets: number[] } {
  const prefix = hanging ? paragraph.match(/^(?:[•◦▪–✓]|(?:[0-9]+|[a-zA-Z]+)\.)\s+/)?.[0] ?? "" : "";
  const body = (prefix ? paragraph.slice(prefix.length) : paragraph).trim(), indent = Math.min(measure(prefix), available * 0.5);
  const lines: string[] = [], offsets: number[] = [];
  let line = prefix, offset = 0, first = true;
  const push = () => { lines.push(line.trimEnd()); offsets.push(offset); first = false; line = ""; offset = indent; };
  for (const word of body.split(/\s+/).filter(Boolean)) {
    const hasBody = first ? line !== prefix : !!line;
    const candidate = line + (hasBody ? " " : "") + word;
    if (measure(candidate) + offset <= available) { line = candidate; continue; }
    if (hasBody) push();
    const currentHasBody = first ? line !== prefix : !!line;
    const next = line + (currentHasBody ? " " : "") + word;
    if (measure(next) + offset <= available) { line = next; continue; }
    for (const part of paragraphGraphemes(word)) {
      if (line && (!first || line !== prefix) && measure(line + part) + offset > available) push();
      line += part;
    }
  }
  lines.push(line.trimEnd()); offsets.push(offset);
  return { lines, offsets };
}
