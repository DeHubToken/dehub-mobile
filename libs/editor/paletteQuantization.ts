/** Bounded weighted colour quantization for small page previews. */
export function extractDominantColours(pixels: ArrayLike<number>, requested = 6): string[] {
  const count = Math.max(2, Math.min(8, Math.round(requested) || 6)), histogram = new Map<number, { r: number; g: number; b: number; weight: number }>();
  const length = Math.min(Math.floor(pixels.length / 4), 1024 * 1024), stride = Math.max(1, Math.ceil(length / 16384));
  for (let index = 0; index < length; index += stride) {
    const at = index * 4, r = pixels[at], g = pixels[at + 1], b = pixels[at + 2], alpha = pixels[at + 3] / 255;
    if (![r, g, b, alpha].every(Number.isFinite) || alpha < 0.5) continue;
    const key = (Math.floor(r / 8) << 10) | (Math.floor(g / 8) << 5) | Math.floor(b / 8), bin = histogram.get(key);
    if (bin) { bin.r += r * alpha; bin.g += g * alpha; bin.b += b * alpha; bin.weight += alpha; }
    else histogram.set(key, { r: r * alpha, g: g * alpha, b: b * alpha, weight: alpha });
  }
  const entries = [...histogram.values()].map(bin => ({ r: bin.r / bin.weight, g: bin.g / bin.weight, b: bin.b / bin.weight, weight: bin.weight }));
  if (!entries.length) return [];
  const box = (items: typeof entries) => {
    const ranges = ["r", "g", "b"].map(key => { const channel = key as "r" | "g" | "b"; let min = 255, max = 0; for (const item of items) { min = Math.min(min, item[channel]); max = Math.max(max, item[channel]); } return { channel, range: max - min }; }).sort((a, b) => b.range - a.range);
    return { items, channel: ranges[0].channel, range: ranges[0].range, weight: items.reduce((sum, item) => sum + item.weight, 0) };
  };
  const boxes = [box(entries)];
  while (boxes.length < count) {
    let selected = -1, score = -1;
    boxes.forEach((current, index) => { const value = current.range * Math.sqrt(current.weight); if (current.items.length > 1 && current.range >= 16 && value > score) { selected = index; score = value; } });
    if (selected < 0) break;
    const current = boxes[selected], items = [...current.items].sort((a, b) => a[current.channel] - b[current.channel]);
    let weight = 0, middle = 1;
    for (let index = 0; index < items.length - 1; index++) { weight += items[index].weight; middle = index + 1; if (weight >= current.weight / 2) break; }
    boxes.splice(selected, 1, box(items.slice(0, middle)), box(items.slice(middle)));
  }
  const palette: { rgb: number[]; weight: number }[] = [];
  for (const current of boxes.sort((a, b) => b.weight - a.weight)) {
    const rgb = (["r", "g", "b"] as const).map(channel => Math.round(current.items.reduce((sum, item) => sum + item[channel] * item.weight, 0) / current.weight));
    if (!palette.some(item => item.rgb.reduce((sum, value, index) => sum + (value - rgb[index]) ** 2, 0) < 24 ** 2)) palette.push({ rgb, weight: current.weight });
  }
  return palette.map(item => "#" + item.rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join(""));
}
