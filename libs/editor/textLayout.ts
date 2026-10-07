export interface MeasuredTextStyle {
  text: string;
  uppercase?: boolean;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  x: number;
  y: number;
  align: "left" | "centre" | "right";
  maxWidth?: number;
  maxHeight?: number;
  background?: { padding: number } | null;
  stroke?: { width: number } | null;
}

/** Measure visual lines without changing subtitle text or its timestamps. */
export function measuredTextLayout(
  text: MeasuredTextStyle, W: number, H: number,
  measure: (line: string, size: number, spacing: number) => number,
) {
  const raw = text.uppercase ? text.text.toUpperCase() : text.text;
  const requested = Math.max(0.1, text.fontSize / 1080 * H);
  const wrapping = Number.isFinite(text.maxWidth) && text.maxWidth! > 0;
  const fitting = wrapping && Number.isFinite(text.maxHeight) && text.maxHeight! > 0;
  const anchorWidth = text.align === "centre" ? 2 * Math.min(text.x, 1 - text.x)
    : text.align === "left" ? 1 - text.x : text.x;
  const widthLimit = wrapping ? Math.max(1, Math.min(text.maxWidth!, Math.max(0.01, anchorWidth - 0.02)) * W) : Infinity;
  const heightLimit = fitting ? Math.max(1, Math.min(text.maxHeight!, Math.max(0.01, 2 * Math.min(text.y, 1 - text.y) - 0.02)) * H) : Infinity;

  function layout(size: number) {
    const scale = size / requested;
    const spacing = (text.letterSpacing ?? 0) / 1080 * H * scale;
    const padding = text.background ? text.background.padding / 1080 * H * scale : size * 0.2;
    const pad = Math.max(0, padding, (text.stroke?.width ?? 0) / 1080 * H * scale / 2);
    const available = Math.max(0.1, widthLimit - pad * 2);
    const lines: string[] = [];
    const width = (line: string) => measure(line, size, spacing);
    raw.replace(/\r\n?/g, "\n").split("\n").forEach(paragraph => {
      if (!wrapping || width(paragraph) <= available) { lines.push(paragraph); return; }
      let line = "";
      paragraph.trim().split(/\s+/).forEach(word => {
        const candidate = line ? line + " " + word : word;
        if (width(candidate) <= available) { line = candidate; return; }
        if (line) { lines.push(line); line = ""; }
        if (width(word) <= available) { line = word; return; }
        const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(value: string): Iterable<{ segment: string }> } }).Segmenter;
        const parts = Segmenter ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(word), part => part.segment) : Array.from(word);
        parts.forEach(part => {
          if (line && width(line + part) > available) { lines.push(line); line = ""; }
          line += part;
        });
      });
      lines.push(line);
    });
    const widths = lines.map(width);
    const lh = size * (text.lineHeight ?? 1.2);
    const maxW = Math.max(0.1, ...widths);
    return { size, scale, spacing, lh, lines, widths, maxW, pad };
  }

  const fits = (value: ReturnType<typeof layout>) => value.maxW + value.pad * 2 <= widthLimit + 0.01
    && value.lines.length * value.lh + value.pad * 2 <= heightLimit + 0.01;
  let result = layout(requested);
  if (!fitting || fits(result)) return result;
  let low = 0.01, high = requested;
  result = layout(low);
  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2;
    const candidate = layout(middle);
    if (fits(candidate)) { low = middle; result = candidate; } else high = middle;
  }
  return result;
}
