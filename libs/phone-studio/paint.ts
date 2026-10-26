/**
 * The Skia half of the phone studio: scene cards and the overlay (a placed
 * image plus the creator's widgets), drawn offscreen at the camera's frame
 * size and written to PNG files for the native processors to burn into the
 * video (libs/phoneStudio.ts).
 *
 * Only load this through `optionalSkia` (libs/skia): importing Skia on an
 * install whose binary predates it throws.
 *
 * Text goes through Skia's paragraph API with the system font manager, so
 * Arabic shapes and joins, right-to-left lines run the right way, and emoji
 * fall back to the system emoji font — none of which a bare drawText does.
 */
import {
  BlurStyle,
  ClipOp,
  FontWeight,
  ImageFormat,
  PaintStyle,
  Skia,
  TextAlign,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkParagraph,
} from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system/legacy";
import { placeWidget } from "../live-overlay/layout";
import { layoutCard, pixelRect, type CardSpec, type FrameRect } from "./scenes";
import type { PlacedDrawing, WidgetDrawing } from "./widgets";

export interface Size {
  width: number;
  height: number;
}

// ─── Files ────────────────────────────────────────────────────────────────────

const DIR = `${FileSystem.cacheDirectory ?? ""}phone-studio/`;
let dirReady: Promise<void> | null = null;
let seq = 0;

function ensureDir(): Promise<void> {
  dirReady ??= FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  return dirReady;
}

/** Encode a snapshot to a fresh PNG file. The caller deletes it once native has read it. */
async function writePng(image: SkImage, prefix: string): Promise<string> {
  const b64 = image.encodeToBase64(ImageFormat.PNG, 100);
  if (!b64) throw new Error("encode failed");
  await ensureDir();
  seq += 1;
  const path = `${DIR}${prefix}-${Date.now().toString(36)}-${seq}.png`;
  await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

export async function deleteStudioFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // A file the cache sweep already took is not a problem.
  }
}

function surface(size: Size) {
  const w = Math.max(2, Math.round(size.width));
  const h = Math.max(2, Math.round(size.height));
  const s = Skia.Surface.Make(w, h) ?? Skia.Surface.MakeOffscreen(w, h);
  if (!s) throw new Error("could not allocate surface");
  return { s, w, h };
}

function snapshot(s: NonNullable<ReturnType<typeof Skia.Surface.Make>>): SkImage {
  s.flush();
  return s.makeImageSnapshot().makeNonTextureImage();
}

// ─── Text ─────────────────────────────────────────────────────────────────────

interface TextOptions {
  size: number;
  color?: string;
  weight?: FontWeight;
  align?: TextAlign;
  maxLines?: number;
  shadow?: number;
}

function paragraph(text: string, width: number, o: TextOptions): SkParagraph {
  const builder = Skia.ParagraphBuilder.Make({
    maxLines: o.maxLines ?? 1,
    ellipsis: "…",
    textAlign: o.align ?? TextAlign.Left,
  });
  builder.pushStyle({
    color: Skia.Color(o.color ?? "#ffffff"),
    fontSize: Math.max(4, o.size),
    fontStyle: { weight: o.weight ?? FontWeight.Normal },
    ...(o.shadow ? { shadows: [{ color: Skia.Color("rgba(0,0,0,0.55)"), blurRadius: o.shadow, offset: { x: 0, y: 0 } }] } : null),
  });
  builder.addText(text);
  builder.pop();
  const p = builder.build();
  p.layout(Math.max(1, width));
  return p;
}

/** Draw text vertically centred on `cy`, starting at `x`, no wider than `width`. Returns the width used. */
function text(canvas: SkCanvas, value: string, x: number, cy: number, width: number, o: TextOptions): number {
  if (!value) return 0;
  const p = paragraph(value, width, o);
  p.paint(canvas, x, cy - p.getHeight() / 2);
  return Math.min(width, p.getLongestLine());
}

/** Natural width of a single line, for laying pills and values out right to left. */
function textWidth(value: string, o: TextOptions): number {
  if (!value) return 0;
  const p = paragraph(value, 100_000, o);
  return p.getLongestLine();
}

// ─── Cards ────────────────────────────────────────────────────────────────────

/** A scene card at `size`, as a PNG file. */
export async function renderCard(card: CardSpec, size: Size, now: number): Promise<string> {
  const { s, w, h } = surface(size);
  const canvas = s.getCanvas();
  const bg = Skia.Paint();
  bg.setColor(Skia.Color(card.background || "#0b0b0f"));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), bg);
  // A soft vignette so a flat colour does not look like a dead feed.
  const glow = Skia.Paint();
  glow.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: w / 2, y: h / 2 },
      Math.max(w, h) * 0.7,
      [Skia.Color("rgba(255,255,255,0.06)"), Skia.Color("rgba(0,0,0,0.35)")],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), glow);

  const layout = layoutCard(card, w, h, now);
  const left = (w - layout.maxWidth) / 2;
  for (const line of layout.lines) {
    text(canvas, line.text, left, line.y, layout.maxWidth, {
      size: line.size,
      weight: line.weight === "800" ? FontWeight.ExtraBold : FontWeight.SemiBold,
      color: `rgba(255,255,255,${line.opacity})`,
      align: TextAlign.Center,
      shadow: layout.shadowBlur,
    });
  }
  return writePng(snapshot(s), "card");
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

const imageCache = new Map<string, Promise<SkImage | null>>();

/** Decode an image once per uri. */
export function loadImage(uri: string): Promise<SkImage | null> {
  let hit = imageCache.get(uri);
  if (!hit) {
    hit = Skia.Data.fromURI(uri)
      .then((data) => Skia.Image.MakeImageFromEncoded(data))
      .catch(() => null);
    imageCache.set(uri, hit);
    if (imageCache.size > 4) imageCache.delete(imageCache.keys().next().value as string);
  }
  return hit;
}

export interface OverlayContent {
  image?: { image: SkImage; rect: FrameRect } | null;
  drawings: PlacedDrawing[];
}

/** The overlay at `size` as a PNG file, or null when there is nothing on it. */
export async function renderOverlay(content: OverlayContent, size: Size): Promise<string | null> {
  if (!content.image && content.drawings.length === 0) return null;
  const { s, w, h } = surface(size);
  const canvas = s.getCanvas();
  canvas.clear(Skia.Color("transparent"));

  if (content.image) {
    const r = pixelRect(content.image.rect, w, h);
    const img = content.image.image;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    canvas.save();
    canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(r.x, r.y, r.w, r.h), r.w * 0.04, r.w * 0.04), ClipOp.Intersect, true);
    canvas.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(r.x, r.y, r.w, r.h), paint);
    canvas.restore();
  }

  const picture = { left: 0, top: 0, width: w, height: h };
  for (const placed of content.drawings) {
    const box = placeWidget(placed.rect, picture);
    if (box.width < 2 || box.height < 2) continue;
    canvas.save();
    canvas.clipRect(Skia.XYWHRect(box.left, box.top, box.width, box.height), ClipOp.Intersect, true);
    try {
      paintWidget(canvas, placed.drawing, box.left, box.top, box.width, box.height);
    } catch {
      // One widget failing to draw must not cost the others.
    }
    canvas.restore();
  }
  return writePng(snapshot(s), "overlay");
}

// ─── Widgets ──────────────────────────────────────────────────────────────────

/** The in-app widgets' glass: dark, slightly translucent, hairline border. */
function glass(canvas: SkCanvas, x: number, y: number, w: number, h: number, radius: number, fill = "rgba(10,10,12,0.72)") {
  const rr = Skia.RRectXY(Skia.XYWHRect(x, y, w, h), radius, radius);
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(fill));
  canvas.drawRRect(rr, p);
  const border = Skia.Paint();
  border.setAntiAlias(true);
  border.setStyle(PaintStyle.Stroke);
  border.setStrokeWidth(1);
  border.setColor(Skia.Color("rgba(255,255,255,0.16)"));
  canvas.drawRRect(rr, border);
}

function circle(canvas: SkCanvas, cx: number, cy: number, r: number, color: string) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  canvas.drawCircle(cx, cy, r, p);
}

/** The DHB coin, as a small gold disc with a darker rim. */
function coin(canvas: SkCanvas, x: number, cy: number, size: number) {
  const r = size / 2;
  circle(canvas, x + r, cy, r, "#f5b301");
  circle(canvas, x + r, cy, r * 0.62, "#ffd54a");
}

function icon(canvas: SkCanvas, kind: "eye" | "dot" | "thumb", x: number, cy: number, size: number, color: string) {
  if (kind === "dot") {
    circle(canvas, x + size * 0.225, cy, size * 0.225, color);
    return;
  }
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(Math.max(1, size * 0.1));
  if (kind === "eye") {
    const path = Skia.Path.Make();
    path.moveTo(x, cy);
    path.quadTo(x + size / 2, cy - size * 0.55, x + size, cy);
    path.quadTo(x + size / 2, cy + size * 0.55, x, cy);
    path.close();
    canvas.drawPath(path, p);
    circle(canvas, x + size / 2, cy, size * 0.16, color);
  } else {
    // A thumbs-up reduced to its silhouette: a stem and a raised thumb.
    const path = Skia.Path.Make();
    path.addRRect(Skia.RRectXY(Skia.XYWHRect(x, cy - size * 0.1, size * 0.22, size * 0.5), 2, 2));
    path.moveTo(x + size * 0.32, cy + size * 0.4);
    path.lineTo(x + size * 0.32, cy - size * 0.05);
    path.lineTo(x + size * 0.52, cy - size * 0.45);
    path.lineTo(x + size * 0.6, cy - size * 0.1);
    path.lineTo(x + size * 0.95, cy - size * 0.1);
    path.lineTo(x + size * 0.85, cy + size * 0.4);
    path.close();
    canvas.drawPath(path, p);
  }
}

function avatarInitial(canvas: SkCanvas, initial: string, x: number, cy: number, size: number) {
  circle(canvas, x + size / 2, cy, size / 2, "rgba(255,255,255,0.18)");
  text(canvas, initial, x, cy, size, { size: size * 0.5, weight: FontWeight.Bold, align: TextAlign.Center });
}

function paintWidget(canvas: SkCanvas, d: WidgetDrawing, x: number, y: number, w: number, h: number) {
  switch (d.type) {
    case "banner":
      return paintBanner(canvas, d, x, y, w, h);
    case "goal":
      return paintGoal(canvas, d, x, y, w, h);
    case "pill":
      return paintPill(canvas, d, x, y, w, h);
    case "list":
      return paintList(canvas, d, x, y, w, h);
    case "chat":
      return paintChat(canvas, d, x, y, w, h);
    case "text":
      return paintText(canvas, d, x, y, w, h);
    case "ticker":
      return paintTicker(canvas, d, x, y, w, h);
    case "frame":
      return paintFrame(canvas, d, x, y, w, h);
  }
}

function paintBanner(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "banner" }>, x: number, y: number, w: number, h: number) {
  glass(canvas, x, y, w, h, h * 0.22);
  const pad = h * 0.18;
  const gap = h * 0.12;
  const avatar = Math.max(16, h * 0.6);
  const cy = y + h / 2;
  avatarInitial(canvas, d.initial, x + pad, cy, avatar);
  const tx = x + pad + avatar + gap;
  const tw = Math.max(1, w - (tx - x) - pad);
  if (!d.detail && !d.message) {
    text(canvas, d.title, tx, cy, tw, { size: h * 0.26, weight: FontWeight.Bold });
    return;
  }
  const rows: Array<{ value: string; size: number; weight: FontWeight; color: string; coin?: boolean }> = [
    { value: d.title, size: h * 0.24, weight: FontWeight.Bold, color: "#ffffff" },
  ];
  if (d.detail) rows.push({ value: d.detail, size: h * 0.18, weight: FontWeight.Normal, color: "rgba(255,255,255,0.78)", coin: d.coin });
  if (d.message) rows.push({ value: d.message, size: h * 0.17, weight: FontWeight.Normal, color: "rgba(255,255,255,0.9)" });
  const total = rows.reduce((sum, r) => sum + r.size * 1.25, 0);
  let ry = cy - total / 2;
  for (const r of rows) {
    const mid = ry + (r.size * 1.25) / 2;
    const used = text(canvas, r.value, tx, mid, tw - (r.coin ? r.size * 1.4 : 0), { size: r.size, weight: r.weight, color: r.color });
    if (r.coin) coin(canvas, tx + used + r.size * 0.3, mid, Math.max(10, r.size));
    ry += r.size * 1.25;
  }
}

function paintGoal(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "goal" }>, x: number, y: number, w: number, h: number) {
  glass(canvas, x, y, w, h, h * 0.22);
  const pad = h * 0.2;
  const font = h * 0.22;
  const barH = h * 0.2;
  const textCy = y + h / 2 - barH * 0.5 - h * 0.05;
  const innerW = w - pad * 2;
  const coinW = d.coin ? Math.max(10, font) + font * 0.3 : 0;
  const suffix = d.unit ? ` ${d.unit}` : "";
  const valueW = Math.min(innerW * 0.6, textWidth(d.value + suffix, { size: font, weight: FontWeight.SemiBold }));
  const vx = x + w - pad - coinW - valueW;
  text(canvas, d.value + suffix, vx, textCy, valueW + 1, { size: font, weight: FontWeight.SemiBold, color: "rgba(255,255,255,0.85)" });
  if (d.coin) coin(canvas, vx + valueW + font * 0.3, textCy, Math.max(10, font));
  text(canvas, d.title, x + pad, textCy, Math.max(1, vx - (x + pad) - 8), { size: font, weight: FontWeight.Bold });

  const by = textCy + font * 0.7 + h * 0.06;
  const track = Skia.RRectXY(Skia.XYWHRect(x + pad, by, innerW, barH), barH / 2, barH / 2);
  const tp = Skia.Paint();
  tp.setAntiAlias(true);
  tp.setColor(Skia.Color("rgba(255,255,255,0.14)"));
  canvas.drawRRect(track, tp);
  if (d.progress > 0) {
    const fp = Skia.Paint();
    fp.setAntiAlias(true);
    fp.setColor(Skia.Color(d.accent));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x + pad, by, Math.max(barH, innerW * d.progress), barH), barH / 2, barH / 2), fp);
  }
}

function paintPill(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "pill" }>, x: number, y: number, w: number, h: number) {
  const font = h * 0.42;
  const padX = h * 0.25;
  const gap = font * 0.35;
  const iconW = d.icon === "dot" ? font * 0.45 : font;
  const labelW = d.label ? textWidth(d.label, { size: font, weight: FontWeight.SemiBold }) : 0;
  const valueW = textWidth(d.value, { size: font, weight: FontWeight.Bold });
  const pillW = Math.min(w, padX * 2 + iconW + gap + (d.label ? labelW + gap : 0) + valueW);
  glass(canvas, x, y, pillW, h, h / 2);
  const cy = y + h / 2;
  let cx = x + padX;
  icon(canvas, d.icon, cx, cy, d.icon === "dot" ? font : font, d.icon === "eye" ? "#ffffff" : d.accent);
  cx += iconW + gap;
  if (d.label) {
    cx += text(canvas, d.label, cx, cy, Math.max(1, x + pillW - padX - cx), { size: font, weight: FontWeight.SemiBold, color: "rgba(255,255,255,0.8)" }) + gap;
  }
  text(canvas, d.value, cx, cy, Math.max(1, x + pillW - padX - cx + 1), { size: font, weight: FontWeight.Bold });
}

function paintList(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "list" }>, x: number, y: number, w: number, h: number) {
  const row = h / (d.slots + (d.title ? 1 : 0));
  glass(canvas, x, y, w, h, row * 0.4);
  const padX = row * 0.45;
  const padY = row * 0.3;
  let cy = y + padY + row * 0.35;
  if (d.title) {
    text(canvas, d.title, x + padX, cy, w - padX * 2, { size: row * 0.42, weight: FontWeight.Bold });
    cy += row * 0.42 + row * 0.15 + row * 0.15;
  }
  const font = row * 0.4;
  for (const r of d.rows) {
    let tx = x + padX;
    if (r.rank) {
      text(canvas, r.rank, tx, cy, row * 0.6, { size: font, weight: FontWeight.Bold, color: "rgba(255,255,255,0.7)", align: TextAlign.Center });
      tx += row * 0.6 + row * 0.3;
    }
    let right = x + w - padX;
    if (r.value) {
      const coinW = r.coin ? Math.max(10, font) + font * 0.3 : 0;
      const vw = textWidth(r.value, { size: font, weight: FontWeight.SemiBold });
      const vx = right - coinW - vw;
      text(canvas, r.value, vx, cy, vw + 1, { size: font, weight: FontWeight.SemiBold });
      if (r.coin) coin(canvas, vx + vw + font * 0.3, cy, Math.max(10, font));
      right = vx - row * 0.3;
    }
    text(canvas, r.name, tx, cy, Math.max(1, right - tx), { size: font });
    cy += row;
    if (cy > y + h) break;
  }
}

function paintChat(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "chat" }>, x: number, y: number, w: number, h: number) {
  const row = h / d.slots;
  const font = row * 0.4;
  const lineH = row * 0.9;
  const gap = row * 0.08;
  // Newest at the bottom, as the in-app chat box stacks them.
  let bottom = y + h;
  for (let i = d.lines.length - 1; i >= 0; i--) {
    const line = d.lines[i];
    const top = bottom - lineH;
    if (top < y) break;
    const padX = row * 0.3;
    const nameW = textWidth(`${line.name} `, { size: font, weight: FontWeight.Bold });
    const msgW = textWidth(line.text, { size: font });
    const bubbleW = Math.min(w, padX * 2 + nameW + msgW);
    glass(canvas, x, top, bubbleW, lineH, row * 0.45, "rgba(10,10,12,0.62)");
    const cy = top + lineH / 2;
    const used = text(canvas, `${line.name} `, x + padX, cy, Math.max(1, bubbleW - padX * 2), {
      size: font,
      weight: FontWeight.Bold,
      color: "rgba(255,255,255,0.75)",
    });
    text(canvas, line.text, x + padX + used, cy, Math.max(1, bubbleW - padX * 2 - used), { size: font });
    bottom = top - gap;
  }
}

function paintText(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "text" }>, x: number, y: number, w: number, h: number) {
  let tx = x;
  let tw = w;
  if (d.lowerThird) {
    const bg = Skia.Paint();
    bg.setColor(Skia.Color("rgba(10,10,12,0.72)"));
    canvas.drawRect(Skia.XYWHRect(x, y, w, h), bg);
    const bar = Skia.Paint();
    bar.setColor(Skia.Color(d.accent));
    canvas.drawRect(Skia.XYWHRect(x, y, h * 0.07, h), bar);
    tx = x + h * 0.07 + h * 0.25;
    tw = w - (tx - x) - h * 0.1;
  }
  const titleSize = h * (d.lowerThird ? 0.32 : 0.5);
  const subSize = h * 0.19;
  const total = (d.text ? titleSize * 1.2 : 0) + (d.subtext ? subSize * 1.3 : 0);
  let cy = y + h / 2 - total / 2;
  if (d.text) {
    text(canvas, d.text, tx, cy + titleSize * 0.6, tw, {
      size: titleSize,
      weight: FontWeight.ExtraBold,
      shadow: d.lowerThird ? 0 : 8,
    });
    cy += titleSize * 1.2;
  }
  if (d.subtext) text(canvas, d.subtext, tx, cy + subSize * 0.65, tw, { size: subSize, color: "rgba(255,255,255,0.78)" });
}

function paintTicker(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "ticker" }>, x: number, y: number, w: number, h: number) {
  const bg = Skia.Paint();
  bg.setColor(Skia.Color("rgba(10,10,12,0.72)"));
  canvas.drawRect(Skia.XYWHRect(x, y, w, h), bg);
  const top = Skia.Paint();
  top.setColor(Skia.Color(d.accent));
  canvas.drawRect(Skia.XYWHRect(x, y, w, Math.max(1, h * 0.06)), top);
  const font = h * 0.48;
  // Two copies side by side moved by one copy's width, as the in-app ticker
  // does, so the loop restart is invisible.
  const copyW = textWidth(d.text, { size: font, weight: FontWeight.Bold }) + font * 4;
  const offset = -d.phase * copyW;
  const cy = y + h / 2;
  for (let start = x + offset; start < x + w; start += copyW) {
    text(canvas, d.text, start, cy, copyW, { size: font, weight: FontWeight.Bold });
  }
}

function paintFrame(canvas: SkCanvas, d: Extract<WidgetDrawing, { type: "frame" }>, x: number, y: number, w: number, h: number) {
  // Thickness and rounding are thousandths of the widget's height, as on web.
  const stroke = Math.max(1, (h * d.thickness) / 1000);
  const radius = (h * d.radius) / 1000;
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(stroke);
  p.setColor(Skia.Color(d.accent));
  const rr = Skia.RRectXY(Skia.XYWHRect(x + stroke / 2, y + stroke / 2, w - stroke, h - stroke), radius, radius);
  if (d.glow) {
    const g = p.copy();
    g.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 12, true));
    canvas.drawRRect(rr, g);
  }
  canvas.drawRRect(rr, p);
}
