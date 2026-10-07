/** Caption layout shared by the native preview and every export frame. */
export const TEXT_LAYOUT_RUNTIME = String.raw`function measuredTextLayout(text, W, H, measure) {
  const raw = text.uppercase ? text.text.toUpperCase() : text.text;
  const requested = Math.max(0.1, text.fontSize / 1080 * H);
  const wrapping = Number.isFinite(text.maxWidth) && text.maxWidth > 0;
  const fitting = wrapping && Number.isFinite(text.maxHeight) && text.maxHeight > 0;
  const anchorWidth = text.align === "centre" ? 2 * Math.min(text.x, 1 - text.x)
    : text.align === "left" ? 1 - text.x : text.x;
  const widthLimit = wrapping ? Math.max(1, Math.min(text.maxWidth, Math.max(0.01, anchorWidth - 0.02)) * W) : Infinity;
  const heightLimit = fitting ? Math.max(1, Math.min(text.maxHeight, Math.max(0.01, 2 * Math.min(text.y, 1 - text.y) - 0.02)) * H) : Infinity;

  function layout(size) {
    const scale = size / requested;
    const spacing = (text.letterSpacing == null ? 0 : text.letterSpacing) / 1080 * H * scale;
    const padding = text.background ? text.background.padding / 1080 * H * scale : size * 0.2;
    const pad = Math.max(0, padding, (text.stroke ? text.stroke.width : 0) / 1080 * H * scale / 2);
    const available = Math.max(0.1, widthLimit - pad * 2);
    const lines = [];
    const width = (line) => measure(line, size, spacing);
    raw.replace(/\r\n?/g, "\n").split("\n").forEach(paragraph => {
      if (!wrapping || width(paragraph) <= available) { lines.push(paragraph); return; }
      let line = "";
      paragraph.trim().split(/\s+/).forEach(word => {
        const candidate = line ? line + " " + word : word;
        if (width(candidate) <= available) { line = candidate; return; }
        if (line) { lines.push(line); line = ""; }
        if (width(word) <= available) { line = word; return; }
        const Segmenter = Intl.Segmenter;
        const parts = Segmenter ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(word), part => part.segment) : Array.from(word);
        parts.forEach(part => {
          if (line && width(line + part) > available) { lines.push(line); line = ""; }
          line += part;
        });
      });
      lines.push(line);
    });
    const widths = lines.map(width);
    const lh = size * (text.lineHeight == null ? 1.2 : text.lineHeight);
    const maxW = Math.max(0.1, ...widths);
    return { size, scale, spacing, lh, lines, widths, maxW, pad };
  }

  const fits = (value) => value.maxW + value.pad * 2 <= widthLimit + 0.01
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
`;
