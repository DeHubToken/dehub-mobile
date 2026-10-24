import { balancedTextParagraph } from "./balancedTextWrap";
import { resolvedTextDirection, type TextDirection } from "./textDirection";
import { wrapTextParagraph } from "./textParagraphWrap";
import { formatTextList, type TextListStyle } from "./textList";
import { curvedTextLayout } from "./curvedText";
export interface MeasuredTextStyle {
  balance?: boolean;
  direction?: TextDirection;
  text: string;
  uppercase?: boolean;
  curve?: number;
  echo?: Array<{ x: number; y: number }>;
  list?: "none" | "bullet" | "number";
  listStyle?: TextListStyle;
  fontSize: number;
  lineHeight?: number;
  paragraphSpacing?: number;
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
  const source = text.uppercase ? text.text.toUpperCase() : text.text;
  const raw = formatTextList(source, text.list, text.listStyle), rtl = resolvedTextDirection(source, text.direction) === "rtl";
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
    const echoPad = Math.max(0, ...(text.echo ?? []).slice(0, 3).map(layer => Math.max(Math.abs(layer.x), Math.abs(layer.y)) / 1080 * H * scale));
    const pad = Math.max(0, padding, echoPad, (text.stroke?.width ?? 0) / 1080 * H * scale / 2);
    const available = Math.max(0.1, widthLimit - pad * 2);
    const lines: string[] = [], offsets: number[] = [], paragraphStarts: number[] = [];
    const width = (line: string) => measure(line, size, spacing);
    raw.replace(/\r\n?/g, "\n").split("\n").forEach(paragraph => {
      paragraphStarts.push(lines.length);
      if (!wrapping || width(paragraph) <= available) { lines.push(paragraph); offsets.push(0); return; }
      const wrapped = text.balance && (!text.list || text.list === "none") ? balancedTextParagraph(paragraph, available, width) : wrapTextParagraph(paragraph, available, width, (text.list === "bullet" || text.list === "number") && (text.align === "left" || rtl && text.align === "right") && Math.abs(text.curve ?? 0) < 0.01);
      lines.push(...wrapped.lines); offsets.push(...wrapped.offsets.map(offset => rtl && text.align === "right" ? -offset : offset));
    });
    const widths = lines.map(width);
    const lh = size * (text.lineHeight ?? 1.2);
    const paragraphGap = Math.max(0, Math.min(300, text.paragraphSpacing ?? 0)) / 1080 * H * scale, starts = new Set(paragraphStarts.slice(1));
    let extraGap = 0;
    const lineY = lines.map((_, index) => { if (starts.has(index)) extraGap += paragraphGap; return index * lh + extraGap; });
    const height = lines.length * lh + extraGap;
    const maxW = Math.max(0.1, ...widths.map((value, index) => value + Math.abs(offsets[index])));
    const curve = curvedTextLayout(lines, size, lh, text.curve ?? 0, width, lineY);
    return { size, scale, spacing, lh, height, lineY, lines, offsets, widths, maxW, pad, curve };
  }

  const fits = (value: ReturnType<typeof layout>) => (value.curve?.width ?? value.maxW) + value.pad * 2 <= widthLimit + 0.01
    && (value.curve?.height ?? value.height) + value.pad * 2 <= heightLimit + 0.01;
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
