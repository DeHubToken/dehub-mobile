import { sampleStroke } from "./freehand";
export function simplifyFreehandPoints(input: [number, number][], tolerance: number, closed = false): [number, number][] {
  if (!Number.isFinite(tolerance) || tolerance < 0.0001 || tolerance > 0.05) throw new Error("Choose a supported path precision");
  const original = sampleStroke(input);
  if (original.length < 3) return original;
  const points = closed ? [...original, original[0]] : original, keep = new Uint8Array(points.length), stack: [number, number][] = [[0, points.length - 1]];
  keep[0] = keep[points.length - 1] = 1;
  let work = 0;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last - first <= 1) continue;
    const a = points[first], b = points[last], dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    let maximum = tolerance * tolerance, chosen = -1;
    for (let index = first + 1; index < last; index++) {
      if (++work > 262144) { for (let index = first; index <= last; index++) keep[index] = 1; for (const [from, to] of stack) for (let index = from; index <= to; index++) keep[index] = 1; stack.length = 0; chosen = -1; break; }
      const point = points[index], ratio = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
      const x = point[0] - a[0] - ratio * dx, y = point[1] - a[1] - ratio * dy, distance = x * x + y * y;
      if (distance > maximum) { maximum = distance; chosen = index; }
    }
    if (chosen >= 0) { keep[chosen] = 1; stack.push([first, chosen], [chosen, last]); }
  }
  const result = points.filter((_, index) => !!keep[index]);
  if (closed) result.pop();
  return result.length >= (closed ? 3 : 2) ? result.map(point => [...point] as [number, number]) : original;
}
export function straightenFreehandPoints(points: [number, number][]): [number, number][] {
  const valid = sampleStroke(points);
  if (valid.length < 2) throw new Error("This drawing needs two distinct endpoints");
  const first = valid[0], last = valid[valid.length - 1];
  if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 0.00001) throw new Error("This drawing's endpoints overlap. Use simplify instead");
  return [[...first], [...last]];
}
