/**
 * The photo studio's painter: crop, rotate and straighten, the look and adjust
 * dials, a vignette, then marks on top — all drawn from the ORIGINAL picture,
 * so edits stay changeable until Done. One painter serves the on-screen preview
 * and the full-size bake, so what posts is what was shown.
 *
 * Skia-drawn: only load this through `optionalSkia` (libs/skia).
 */
import { Skia, ClipOp, ImageFormat, TileMode, type SkCanvas, type SkImage } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system/legacy";
import { DEFAULT_ADJUST, studioColorMatrix, type StudioAdjust } from "../../libs/imageFilters";
import { loadImage, paintAnnotationsOnly, type Annotation } from "./imageEditSkia";

export type CropRatioId = "original" | "free" | "1:1" | "4:5" | "9:16" | "16:9";

export interface StudioCrop {
  /** Quarter turns clockwise, 0..3. */
  quarter: number;
  flipX: boolean;
  /** Fine rotation in degrees, -45..45. */
  straighten: number;
  ratio: CropRatioId;
  /** The kept part, 0..1 of the turned picture. */
  rect: { x: number; y: number; w: number; h: number };
}

export interface StudioEdits {
  crop: StudioCrop;
  lookId: string;
  /** 0..100 */
  strength: number;
  adjust: StudioAdjust;
  items: Annotation[];
}

export const DEFAULT_CROP: StudioCrop = { quarter: 0, flipX: false, straighten: 0, ratio: "original", rect: { x: 0, y: 0, w: 1, h: 1 } };

export function defaultEdits(): StudioEdits {
  return { crop: { ...DEFAULT_CROP, rect: { ...DEFAULT_CROP.rect } }, lookId: "normal", strength: 100, adjust: { ...DEFAULT_ADJUST }, items: [] };
}

export function hasStudioEdits(e?: StudioEdits | null): boolean {
  if (!e) return false;
  const c = e.crop;
  const cropped = c.quarter !== 0 || c.flipX || c.straighten !== 0 || c.rect.x > 0.001 || c.rect.y > 0.001 || c.rect.w < 0.999 || c.rect.h < 0.999;
  return cropped || e.lookId !== "normal" || Object.values(e.adjust).some((v) => v !== 0) || e.items.length > 0;
}

/** Size of the picture after the quarter turns. */
export function turnedSize(w: number, h: number, quarter: number) {
  return quarter % 2 === 0 ? { w, h } : { w: h, h: w };
}

/** Zoom needed so a picture turned by `deg` still covers its own frame. */
export function straightenCover(w: number, h: number, deg: number) {
  const r = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/** Pixel size of the edited picture. */
export function outputSize(image: { width(): number; height(): number }, crop: StudioCrop) {
  const t = turnedSize(image.width(), image.height(), crop.quarter);
  return { w: Math.max(1, Math.round(t.w * crop.rect.w)), h: Math.max(1, Math.round(t.h * crop.rect.h)) };
}

/**
 * Draw the picture turned and straightened into a `w` x `h` box, showing only
 * `rect` of it (pass the whole rect to draw the full turned picture, as the
 * crop tab does).
 */
function paintPicture(canvas: SkCanvas, image: SkImage, w: number, h: number, crop: StudioCrop, rect: StudioCrop["rect"], matrix: number[] | null) {
  const W = image.width();
  const H = image.height();
  const t = turnedSize(W, H, crop.quarter);
  const f = w / (rect.w * t.w);
  const cover = straightenCover(t.w, t.h, crop.straighten);
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, 0, w, h), ClipOp.Intersect, true);
  canvas.scale(f, h / (rect.h * t.h));
  canvas.translate(-rect.x * t.w, -rect.y * t.h);
  canvas.translate(t.w / 2, t.h / 2);
  canvas.rotate(crop.quarter * 90 + crop.straighten, 0, 0);
  canvas.scale((crop.flipX ? -1 : 1) * cover, cover);
  canvas.translate(-W / 2, -H / 2);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (matrix) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));
  canvas.drawImageRect(image, Skia.XYWHRect(0, 0, W, H), Skia.XYWHRect(0, 0, W, H), paint);
  canvas.restore();
}

function paintVignette(canvas: SkCanvas, w: number, h: number, amount: number) {
  if (amount <= 0) return;
  const paint = Skia.Paint();
  const r = Math.hypot(w, h) / 2;
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: w / 2, y: h / 2 },
      r,
      [Skia.Color("rgba(0,0,0,0)"), Skia.Color(`rgba(0,0,0,${(0.65 * amount) / 100})`)],
      [0.45, 1],
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
}

/** The finished picture: crop, colour, vignette, marks. */
export function paintStudio(canvas: SkCanvas, image: SkImage, w: number, h: number, e: StudioEdits, opts?: { skipItems?: boolean }) {
  const matrix = studioColorMatrix(e.lookId, e.strength, e.adjust);
  paintPicture(canvas, image, w, h, e.crop, e.crop.rect, matrix);
  paintVignette(canvas, w, h, e.adjust.vignette);
  if (!opts?.skipItems && e.items.length) paintAnnotationsOnly(canvas, e.items, w, h);
}

/** The whole turned picture with colour, for the crop tab's backdrop. */
export function paintUncropped(canvas: SkCanvas, image: SkImage, w: number, h: number, e: StudioEdits) {
  const matrix = studioColorMatrix(e.lookId, e.strength, e.adjust);
  paintPicture(canvas, image, w, h, e.crop, { x: 0, y: 0, w: 1, h: 1 }, matrix);
}

/** Render the edits at full size from the original and write a new file. */
export async function bakeStudio(
  baseUri: string,
  e: StudioEdits,
  sourceMime?: string | null,
): Promise<{ uri: string; width: number; height: number; mimeType: string; fileName: string }> {
  const image = await loadImage(baseUri);
  if (!image) throw new Error("could not decode image");
  const { w, h } = outputSize(image, e.crop);
  const surface = Skia.Surface.Make(w, h) ?? Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error("could not allocate surface");
  paintStudio(surface.getCanvas(), image, w, h, e);
  surface.flush();
  const snapshot = surface.makeImageSnapshot().makeNonTextureImage();
  const lossless = sourceMime === "image/png" || sourceMime === "image/webp";
  const b64 = snapshot.encodeToBase64(lossless ? ImageFormat.PNG : ImageFormat.JPEG, 92);
  if (!b64) throw new Error("encode failed");
  const ext = lossless ? "png" : "jpg";
  const fileName = `edit-${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
  const out = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(out, b64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: out, width: w, height: h, mimeType: lossless ? "image/png" : "image/jpeg", fileName };
}
