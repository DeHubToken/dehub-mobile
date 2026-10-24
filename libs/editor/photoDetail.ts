export function applyPhotoSharpen(pixels: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2560000 || pixels.length !== width * height * 4) return;
  const strength = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0)) * 1.5;
  if (!strength) return;
  const source = pixels.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    if (!source[index + 3]) continue;
    let weight = 0, red = 0, green = 0, blue = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const at = (Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
      const contribution = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1) * source[at + 3] / 255;
      weight += contribution; red += source[at] * contribution; green += source[at + 1] * contribution; blue += source[at + 2] * contribution;
    }
    if (!weight) continue;
    // A common luminance correction preserves the colour of fine edges.
    const local = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / weight;
    const original = source[index] * 0.2126 + source[index + 1] * 0.7152 + source[index + 2] * 0.0722;
    const detail = Math.max(-64, Math.min(64, (original - local) * strength));
    pixels[index] = source[index] + detail; pixels[index + 1] = source[index + 1] + detail; pixels[index + 2] = source[index + 2] + detail;
  }
}
