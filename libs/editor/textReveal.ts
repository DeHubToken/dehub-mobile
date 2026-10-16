type Segmenter = { segment(value: string): Iterable<{ segment: string }> };
type SegmenterConstructor = new (locale?: string, options?: { granularity: string }) => Segmenter;
const SegmenterClass = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
const segmenter = SegmenterClass ? new SegmenterClass(undefined, { granularity: "grapheme" }) : null;

/** Reveal complete graphemes while retaining the original lines and their alignment. */
export function textRevealLines(lines: string[], progress: number): string[] {
  const parts = lines.map(line => segmenter ? Array.from(segmenter.segment(line), item => item.segment) : Array.from(line));
  let remaining = Math.floor(parts.reduce((count, line) => count + line.length, 0) * Math.max(0, Math.min(1, progress)) + 1e-7);
  return parts.map(line => {
    const visible = line.slice(0, Math.max(0, remaining)).join("");
    remaining -= line.length;
    return visible;
  });
}
