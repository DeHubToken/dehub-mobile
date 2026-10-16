export const PHOTO_TONE_RUNTIME = String.raw`
function needsPhotoTone(value) {
  return !!(value.highlights || value.shadows || value.fade || (value.duotone && value.duotone.amount > 0));
}

/** Process a bounded crop once; the compositor caches still-image results by source and style. */
function applyPhotoTone(pixels, value, opaque = false) {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
  const highlights = clamp((value.highlights || 0), -1, 1), shadows = clamp((value.shadows || 0), -1, 1), fade = clamp((value.fade || 0), 0, 1);
  const duo = value.duotone;
  const amount = duo && /^#[\da-f]{6}$/i.test(duo.dark) && /^#[\da-f]{6}$/i.test(duo.light) ? clamp(duo.amount, 0, 1) : 0;
  const dark = amount ? parseInt(duo.dark.slice(1), 16) : 0, light = amount ? parseInt(duo.light.slice(1), 16) : 0;
  const dr = dark >> 16 & 255, dg = dark >> 8 & 255, db = dark & 255;
  const lr = light >> 16 & 255, lg = light >> 8 & 255, lb = light & 255;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
    const shift = 76 * (shadows * (1 - luminance) ** 2 + highlights * luminance ** 2);
    let r = clamp(pixels[index] + shift, 0, 255), g = clamp(pixels[index + 1] + shift, 0, 255), b = clamp(pixels[index + 2] + shift, 0, 255);
    const level = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    if (amount) {
      r += (dr + (lr - dr) * level - r) * amount;
      g += (dg + (lg - dg) * level - g) * amount;
      b += (db + (lb - db) * level - b) * amount;
    }
    pixels[index] = r * (1 - fade * 0.3) + fade * 48;
    pixels[index + 1] = g * (1 - fade * 0.3) + fade * 48;
    pixels[index + 2] = b * (1 - fade * 0.3) + fade * 48;
    if (opaque) pixels[index + 3] = 255;
  }
}
`;
