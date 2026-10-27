/**
 * Auto reframe: fill a narrower page with a wide video and pan to keep the
 * action in view. The subject is where the picture moves most, falling back
 * to where it has the most detail on still shots.
 */
import type { FramePixels } from "./clipTools";
import type { Keyframe } from "./types";

const luma = (d: ArrayLike<number>, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

function columnEnergy(frame: FramePixels, previous?: FramePixels): number[] {
  const { data, width, height } = frame, columns = new Array<number>(width).fill(0);
  for (let y = 1; y < height; y++) for (let x = 1; x < width; x++) {
    const i = (y * width + x) * 4;
    const motion = previous && previous.width === width && previous.height === height ? Math.abs(luma(data, i) - luma(previous.data, i)) : 0;
    const detail = Math.abs(luma(data, i) - luma(data, i - 4)) + Math.abs(luma(data, i) - luma(data, i - width * 4));
    columns[x] += motion * 3 + detail * 0.25;
  }
  return columns;
}

/** Horizontal centre of interest (0..1) for each frame. */
export function subjectCentres(frames: FramePixels[]): number[] {
  const centres: number[] = [];
  frames.forEach((frame, index) => {
    const columns = columnEnergy(frame, frames[index - 1] ?? frames[index + 1]);
    const total = columns.reduce((a, b) => a + b, 0);
    if (total <= 0) { centres.push(centres[index - 1] ?? 0.5); return; }
    // Centre of the strongest third, so a busy background on one side doesn't win.
    const window = Math.max(1, Math.round(frame.width / 3));
    let best = 0, bestAt = 0, run = columns.slice(0, window).reduce((a, b) => a + b, 0);
    for (let x = 0; x + window <= frame.width; x++) {
      if (x > 0) run += columns[x + window - 1] - columns[x - 1];
      if (run > best) { best = run; bestAt = x; }
    }
    let weight = 0, sum = 0;
    for (let x = bestAt; x < bestAt + window; x++) { weight += columns[x]; sum += columns[x] * (x + 0.5); }
    centres.push(weight > 0 ? sum / weight / frame.width : 0.5);
  });
  return centres;
}

/**
 * Canvas x keyframes (clip-local seconds) that keep each centre in the middle.
 * `overflow` is the cover-fitted video width divided by the page width.
 */
export function reframeKeys(samples: { t: number; centre: number }[], overflow: number): Keyframe[] {
  if (!samples.length || overflow <= 1.001) return [];
  const limit = (overflow - 1) / 2;
  const smooth = samples.map((s, i) => {
    const near = samples.slice(Math.max(0, i - 2), i + 3);
    return { t: s.t, centre: near.reduce((a, n) => a + n.centre, 0) / near.length };
  });
  const keys: Keyframe[] = [];
  for (const s of smooth) {
    const x = Math.round(Math.min(0.5 + limit, Math.max(0.5 - limit, 0.5 - (s.centre - 0.5) * overflow)) * 1000) / 1000;
    const last = keys[keys.length - 1];
    // Hold the shot until the subject has really moved, like a camera operator.
    if (last && Math.abs(last.v - x) < 0.04) continue;
    keys.push({ t: Math.round(s.t * 1000) / 1000, v: x, ease: "easeInOut" });
  }
  return keys;
}
