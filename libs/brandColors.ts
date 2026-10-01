/**
 * Brand colours: the most prominent, visually distinct colours of the profile
 * picture, for the Brand Theme Color. Same scoring as web
 * (dehubweb src/lib/brand-colors.ts): pixels are bucketed into a coarse
 * histogram, buckets scored by population weighted toward vivid colours, then
 * picked greedily so the palette is three different colours, not three shades
 * of the background. The picture is decoded and downscaled with Skia.
 */
import { HAS_SKIA, optionalSkia } from './skia';

/**
 * Whether this build can read a picture's colours. Decoding needs Skia, which
 * older binaries on the same runtimeVersion do not have; importing it there is
 * a fatal error, so it is only required inside `extractBrandColors`.
 */
export const CAN_EXTRACT_BRAND_COLORS = HAS_SKIA;

const SAMPLE_SIZE = 64;
const BUCKET_STEP = 16;

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = ((h * 60) % 360 + 360) % 360;
  return [h, s, l];
}

/** Pick up to `max` colours from RGBA pixels (0–255, unpremultiplied). */
export function pickBrandColors(data: ArrayLike<number>, max = 3): string[] {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 125) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (Math.floor(r / BUCKET_STEP) << 10) | (Math.floor(g / BUCKET_STEP) << 5) | Math.floor(b / BUCKET_STEP);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  if (buckets.size === 0) return [];

  const candidates = Array.from(buckets.values()).map((bk) => {
    const r = bk.r / bk.count, g = bk.g / bk.count, b = bk.b / bk.count;
    const [hue, sat, light] = rgbToHsl(r, g, b);
    const midweight = 1 - Math.abs(light - 0.5) * 1.2;
    return { r, g, b, hue, sat, light, score: bk.count * (0.25 + sat * 1.6) * Math.max(0.15, midweight) };
  });
  candidates.sort((a, b) => b.score - a.score);

  const hueDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= max) break;
    const clashes = picked.some((p) => {
      if (c.sat < 0.12 && p.sat < 0.12) return Math.abs(c.light - p.light) < 0.18;
      return hueDist(c.hue, p.hue) < 28 && Math.abs(c.light - p.light) < 0.22;
    });
    if (!clashes) picked.push(c);
  }
  for (const c of candidates) {
    if (picked.length >= max) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.slice(0, max).map((c) => toHex(c.r, c.g, c.b));
}

/** Decode the picture at `uri`, downscale it and pick its brand colours. */
export async function extractBrandColors(uri: string, max = 3): Promise<string[]> {
  const skia = optionalSkia(() => require('@shopify/react-native-skia') as typeof import('@shopify/react-native-skia'));
  if (!skia) throw new Error('This build cannot decode pictures');
  const { AlphaType, ColorType, Skia } = skia;
  const encoded = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(encoded);
  if (!image) throw new Error('Could not decode the picture');
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.width(), image.height()));
  const w = Math.max(1, Math.round(image.width() * scale));
  const h = Math.max(1, Math.round(image.height() * scale));
  const surface = Skia.Surface.Make(w, h) ?? Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('Could not allocate a surface');
  surface.getCanvas().drawImageRect(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(0, 0, w, h),
    Skia.Paint(),
  );
  surface.flush();
  const pixels = surface.makeImageSnapshot().makeNonTextureImage().readPixels(0, 0, {
    width: w,
    height: h,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new Error('Could not read the picture');
  return pickBrandColors(pixels, max);
}
