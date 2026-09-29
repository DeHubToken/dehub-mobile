/**
 * The Skia half of the composer's photo tools: one painter shared by the
 * on-screen preview and the full-resolution bake, so what is posted is what
 * was shown — the same guarantee dehubweb's `applyEditsToImageFile` and
 * `ImageAnnotator` give with a canvas.
 *
 * Only load this through `optionalSkia` (libs/skia): importing Skia on an
 * install whose binary predates it throws.
 */
import {
  Skia,
  ImageFormat,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  matchFont,
  type SkCanvas,
  type SkFont,
  type SkImage,
} from "@shopify/react-native-skia";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { filterColorMatrix, hasFilterApplied, type FilterSettings } from "../../libs/imageFilters";

export interface Point {
  x: number;
  y: number;
}

export interface StrokeItem {
  kind: "stroke";
  points: Point[];
  color: string;
  /** Line width as a fraction of the image's shorter side. */
  width: number;
}

export interface TextItem {
  kind: "text";
  at: Point;
  text: string;
  color: string;
  /** Font size as a fraction of the image's shorter side. */
  size: number;
}

export type Annotation = StrokeItem | TextItem;

export interface EditOps {
  filter?: FilterSettings;
  items?: Annotation[];
}

const FONT_FAMILY = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });
const fontCache = new Map<number, SkFont>();

function fontAt(size: number): SkFont {
  const key = Math.round(size);
  let font = fontCache.get(key);
  if (!font) {
    font = matchFont({ fontFamily: FONT_FAMILY, fontSize: key, fontWeight: "600" });
    fontCache.set(key, font);
  }
  return font;
}

/**
 * Draw `image` into a `w` x `h` box with the filter and marks on top. Marks
 * are in 0..1 coordinates, so the preview and the bake are the same drawing at
 * two sizes.
 */
export function paintEdit(canvas: SkCanvas, image: SkImage, w: number, h: number, ops: EditOps) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (ops.filter && hasFilterApplied(ops.filter)) {
    paint.setColorFilter(Skia.ColorFilter.MakeMatrix(filterColorMatrix(ops.filter)));
  }
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(0, 0, w, h),
    paint,
  );
  if (ops.items?.length) paintAnnotations(canvas, ops.items, w, h);
}

function paintAnnotations(canvas: SkCanvas, items: Annotation[], w: number, h: number) {
  const unit = Math.min(w, h);
  for (const item of items) {
    if (item.kind === "stroke") {
      if (item.points.length === 0) continue;
      const width = Math.max(1, item.width * unit);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setColor(Skia.Color(item.color));
      // A single tap is a dot, not a zero-length line.
      if (item.points.length === 1) {
        const p = item.points[0];
        canvas.drawCircle(p.x * w, p.y * h, width / 2, paint);
        continue;
      }
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(width);
      paint.setStrokeCap(StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
      const path = Skia.Path.Make();
      path.moveTo(item.points[0].x * w, item.points[0].y * h);
      for (let i = 1; i < item.points.length; i++) {
        path.lineTo(item.points[i].x * w, item.points[i].y * h);
      }
      canvas.drawPath(path, paint);
    } else {
      const fontSize = Math.max(8, item.size * unit);
      const font = fontAt(fontSize);
      const metrics = font.getMetrics();
      // The web writes with textBaseline "middle" and textAlign "start".
      const x = item.at.x * w;
      const y = item.at.y * h - (metrics.ascent + metrics.descent) / 2;
      // A dark outline keeps light text legible on a light photo, and vice versa.
      const outline = Skia.Paint();
      outline.setAntiAlias(true);
      outline.setStyle(PaintStyle.Stroke);
      outline.setStrokeWidth(Math.max(1, fontSize * 0.12));
      outline.setStrokeJoin(StrokeJoin.Round);
      outline.setColor(Skia.Color(item.color === "#000000" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)"));
      canvas.drawText(item.text, x, y, outline, font);
      const fill = Skia.Paint();
      fill.setAntiAlias(true);
      fill.setColor(Skia.Color(item.color));
      canvas.drawText(item.text, x, y, fill, font);
    }
  }
}

export async function loadImage(uri: string): Promise<SkImage | null> {
  const data = await Skia.Data.fromURI(uri);
  return Skia.Image.MakeImageFromEncoded(data);
}

/** A copy of `image` at most `maxSide` px long, for preset thumbnails. */
export function downscale(image: SkImage, maxSide: number): SkImage {
  const scale = Math.min(1, maxSide / Math.max(image.width(), image.height()));
  const w = Math.max(1, Math.round(image.width() * scale));
  const h = Math.max(1, Math.round(image.height() * scale));
  const surface = Skia.Surface.Make(w, h) ?? Skia.Surface.MakeOffscreen(w, h);
  if (!surface) return image;
  paintEdit(surface.getCanvas(), image, w, h, {});
  surface.flush();
  return surface.makeImageSnapshot().makeNonTextureImage();
}

/**
 * Render the edit at the image's full size and write it to a new file.
 * PNG and WebP sources come back PNG so transparency survives; everything
 * else is JPEG, as on the web.
 */
export async function bakeEdit(
  uri: string,
  ops: EditOps,
  sourceMime?: string | null,
): Promise<{ uri: string; width: number; height: number; mimeType: string; fileName: string }> {
  const image = await loadImage(uri);
  if (!image) throw new Error("could not decode image");
  const w = image.width();
  const h = image.height();
  const surface = Skia.Surface.Make(w, h) ?? Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error("could not allocate surface");
  paintEdit(surface.getCanvas(), image, w, h, ops);
  surface.flush();
  const snapshot = surface.makeImageSnapshot().makeNonTextureImage();

  const lossless = sourceMime === "image/png" || sourceMime === "image/webp";
  const b64 = snapshot.encodeToBase64(lossless ? ImageFormat.PNG : ImageFormat.JPEG, 92);
  if (!b64) throw new Error("encode failed");
  const ext = lossless ? "png" : "jpg";
  const fileName = `edit-${Date.now()}.${ext}`;
  const out = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(out, b64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: out, width: w, height: h, mimeType: lossless ? "image/png" : "image/jpeg", fileName };
}
