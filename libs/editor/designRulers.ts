export interface RulerMark { position: number; value: number; major: boolean }

/** Pick readable pixel units from the design size and its current displayed scale. */
export function designRulerMarks(pixels: number, displayed: number, pixelsPerUnit = 1): RulerMark[] {
  const size = pixels / pixelsPerUnit;
  if (!Number.isFinite(size) || !Number.isFinite(displayed) || size <= 0 || displayed <= 0) return [];
  const target = 80 * size / displayed, power = 10 ** Math.floor(Math.log10(target));
  const major = [1, 2, 5, 10].map(value => value * power).find(value => value >= target) ?? power * 10;
  const minor = major / 5, count = Math.min(500, Math.floor(size / minor));
  return Array.from({ length: count + 1 }, (_, index) => ({ position: index * minor / size, value: Number((index * minor).toFixed(6)), major: index % 5 === 0 }));
}
