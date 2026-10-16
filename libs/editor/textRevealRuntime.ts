export const TEXT_REVEAL_RUNTIME = String.raw`
const SegmenterClass = Intl.Segmenter;
const segmenter = SegmenterClass ? new SegmenterClass(undefined, { granularity: "grapheme" }) : null;

/** Reveal complete graphemes while retaining the original lines and their alignment. */
function textRevealLines(lines, progress) {
  const parts = lines.map(line => segmenter ? Array.from(segmenter.segment(line), item => item.segment) : Array.from(line));
  let remaining = Math.floor(parts.reduce((count, line) => count + line.length, 0) * Math.max(0, Math.min(1, progress)) + 1e-7);
  return parts.map(line => {
    const visible = line.slice(0, Math.max(0, remaining)).join("");
    remaining -= line.length;
    return visible;
  });
}
`;
