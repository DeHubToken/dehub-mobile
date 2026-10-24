export interface CurvedGlyph { text: string; x: number; y: number; rotation: number; width: number; line: number }

/** Bend each visual line around an arc, then centre its complete rotated glyph bounds. */
export function curvedTextLayout(lines: string[], size: number, lineHeight: number, amount: number,
  measure: (value: string) => number, lineY?: readonly number[]) {
  const curve = Math.max(-100, Math.min(100, Number.isFinite(amount) ? amount : 0));
  if (Math.abs(curve) < 0.01) return null;
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment(value: string): Iterable<{ segment: string }> } }).Segmenter;
  const segmenter = Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
  const glyphs: CurvedGlyph[] = [];
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
      const x = radius * Math.sin(angle), y = sign * radius * (1 - Math.cos(angle)) + (lineY?.[lineIndex] ?? lineIndex * lineHeight);
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
