/** Caption layout shared by the native preview and every export frame. */
export const TEXT_LAYOUT_RUNTIME = String.raw`/** Bend each visual line around an arc, then centre its complete rotated glyph bounds. */
function curvedTextLayout(lines, size, lineHeight, amount, measure) {
  const curve = Math.max(-100, Math.min(100, Number.isFinite(amount) ? amount : 0));
  if (Math.abs(curve) < 0.01) return null;
  const Segmenter = Intl.Segmenter;
  const segmenter = Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
  const glyphs = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const sweep = Math.abs(curve) / 100 * Math.PI, sign = Math.sign(curve);
  lines.forEach((line, lineIndex) => {
    const parts = segmenter ? Array.from(segmenter.segment(line), part => part.segment) : Array.from(line);
    const total = Math.max(1, measure(line)), radius = total / sweep;
    let prefix = "", before = 0;
    parts.forEach(part => {
      prefix += part;
      const after = measure(prefix), advance = Math.max(0, after - before);
      const angle = ((before + after) / 2 - total / 2) / radius;
      const rotation = sign * angle;
      const x = radius * Math.sin(angle), y = sign * radius * (1 - Math.cos(angle)) + lineIndex * lineHeight;
      const width = Math.max(advance, measure(part));
      const halfWidth = Math.abs(Math.cos(rotation)) * width / 2 + Math.abs(Math.sin(rotation)) * size * 0.65;
      const halfHeight = Math.abs(Math.sin(rotation)) * width / 2 + Math.abs(Math.cos(rotation)) * size * 0.65;
      minX = Math.min(minX, x - halfWidth); maxX = Math.max(maxX, x + halfWidth);
      minY = Math.min(minY, y - halfHeight); maxY = Math.max(maxY, y + halfHeight);
      glyphs.push({ text: part, x, y, rotation, width, line: lineIndex });
      before = after;
    });
  });
  if (!glyphs.length) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { width: maxX - minX, height: maxY - minY, glyphs: glyphs.map(glyph => ({ ...glyph, x: glyph.x - cx, y: glyph.y - cy })) };
}

function measuredTextLayout(text, W, H, measure) {
  const source = text.uppercase ? text.text.toUpperCase() : text.text;
  let item = 0;
  const raw = text.list === "bullet" || text.list === "number" ? source.replace(/\r\n?/g, "\n").split("\n")
    .map(line => line.trim() ? (text.list === "bullet" ? "• " : String(++item) + ". ") + line : line).join("\n") : source;
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
    const curve = curvedTextLayout(lines, size, lh, text.curve || 0, width);
    return { size, scale, spacing, lh, lines, widths, maxW, pad, curve };
  }

  const fits = (value) => (value.curve ? value.curve.width : value.maxW) + value.pad * 2 <= widthLimit + 0.01
    && (value.curve ? value.curve.height : value.lines.length * value.lh) + value.pad * 2 <= heightLimit + 0.01;
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
