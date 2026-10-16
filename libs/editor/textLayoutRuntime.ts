/** Caption layout shared by the native preview and every export frame. */
export const TEXT_LAYOUT_RUNTIME = String.raw`function paragraphGraphemes(value) {
  const Segmenter = Intl.Segmenter;
  return Segmenter ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value), part => part.segment) : Array.from(value);
}

/** Keep a list marker with its first word and indent continuation lines beneath the text. */
function wrapTextParagraph(paragraph, available, measure, hanging) {
  const prefix = hanging ? paragraph.match(/^(?:[•◦▪–✓]|(?:[0-9]+|[a-zA-Z]+)\.)\s+/)?.[0] ?? "" : "";
  const body = (prefix ? paragraph.slice(prefix.length) : paragraph).trim(), indent = Math.min(measure(prefix), available * 0.5);
  const lines = [], offsets = [];
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
function textListDigits(value, style) {
  value = Math.max(1, Math.min(20000, Math.floor(value)));
  let output = "";
  if (style.startsWith("alpha")) { for (let n = value; n > 0; n = Math.floor((n - 1) / 26)) output = String.fromCharCode(65 + (n - 1) % 26) + output; }
  else if (style.startsWith("roman") && value < 4000) {
    let rest = value;
    const amounts = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1], symbols = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    amounts.forEach((amount, index) => { while (rest >= amount) { output += symbols[index]; rest -= amount; } });
  } else output = String(value);
  return style.endsWith("lower") ? output.toLowerCase() : output;
}
function formatTextList(source, kind, options) {
  if (kind !== "bullet" && kind !== "number") return source;
  const start = options && Number.isInteger(options.start) ? Math.max(1, Math.min(9999, options.start)) : 1;
  const style = options?.numbering ?? "decimal", bullet = options?.bullet ?? "disc";
  const marker = bullet === "circle" ? "◦" : bullet === "square" ? "▪" : bullet === "dash" ? "–" : bullet === "check" ? "✓" : "•";
  let item = start;
  return source.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim() ? (kind === "bullet" ? marker : textListDigits(item++, style) + ".") + " " + line : line).join("\n");
}

/** Bend each visual line around an arc, then centre its complete rotated glyph bounds. */
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
  const raw = formatTextList(source, text.list, text.listStyle);
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
    const echoPad = Math.max(0, ...(text.echo || []).slice(0, 3).map(layer => Math.max(Math.abs(layer.x), Math.abs(layer.y)) / 1080 * H * scale));
    const pad = Math.max(0, padding, echoPad, (text.stroke ? text.stroke.width : 0) / 1080 * H * scale / 2);
    const available = Math.max(0.1, widthLimit - pad * 2);
    const lines = [], offsets = [];
    const width = (line) => measure(line, size, spacing);
    raw.replace(/\r\n?/g, "\n").split("\n").forEach(paragraph => {
      if (!wrapping || width(paragraph) <= available) { lines.push(paragraph); offsets.push(0); return; }
      const wrapped = wrapTextParagraph(paragraph, available, width, (text.list === "bullet" || text.list === "number") && text.align === "left" && Math.abs(text.curve ?? 0) < 0.01);
      lines.push(...wrapped.lines); offsets.push(...wrapped.offsets);
    });
    const widths = lines.map(width);
    const lh = size * (text.lineHeight == null ? 1.2 : text.lineHeight);
    const maxW = Math.max(0.1, ...widths.map((value, index) => value + offsets[index]));
    const curve = curvedTextLayout(lines, size, lh, text.curve || 0, width);
    return { size, scale, spacing, lh, lines, offsets, widths, maxW, pad, curve };
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
