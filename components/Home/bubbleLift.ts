// Keep this motion contract in step with mobile components/Home/bubbleLift.ts.
export const ESCAPE_PERIOD = 7;
export const ESCAPE_AT = 2.4;
export const MAX_ESCAPED_NOTES = 64;
export const NOTE_HEAD = 'M0 2.1a1.35 .88 -16 1 0 2.7 0a1.35 .88 -16 1 0-2.7 0';
export const NOTE_STEM = 'M2.35 2V-2.7C4-2.15 4.7-1.4 4.2-.25';
export const DOUBLE_HEAD = 'M3.85 1.7a1.35 .88 -16 1 0 2.7 0a1.35 .88 -16 1 0-2.7 0';
export const DOUBLE_STEM = 'M2.35 2V-2.7L6.25-3.3V1.5';
export function noteRandom(n: number) {
  'worklet';
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}
export function tubeNote(i: number, time: number, width: number, height: number) {
  'worklet';
  const a = noteRandom(i * 7.13 + 1), b = noteRandom(i * 11.73 + 5), c = noteRandom(i * 13.37 + 9);
  const phase = time / (4.2 + b * 4.3) + a;
  const cycle = Math.floor(phase), progress = phase - cycle;
  const drift = 22 + (.55 + c * .85) * 34;
  const birth = noteRandom(i * 19.19 + cycle * 7.71 + 3);
  return {
    x: birth * (width + drift + 20) - drift - 10 + progress * drift,
    y: (17 - progress * 34) * height / 8,
    size: (.48 + c * 1.08) * height / 8,
    rotation: -.16 + (a - .5) * .32,
    opacity: .42 + c * .4,
  };
}
export function knobCutoff(thumb: number, radius: number, halfHeight: number) {
  'worklet';
  const h = Math.min(halfHeight, radius);
  const edge = thumb - Math.sqrt(Math.max(0, radius * radius - h * h));
  return `M0 ${-h}H${edge}A${radius} ${radius} 0 0 0 ${edge} ${h}H0Z`;
}
export function escapePose(time: number, thumb: number, radius: number, height: number) {
  'worklet';
  const phase = time % ESCAPE_PERIOD, progress = Math.min(1, phase / ESCAPE_AT);
  return { cycle: Math.floor(time / ESCAPE_PERIOD), ready: phase >= ESCAPE_AT,
    x: thumb - 20 + progress * (radius + 32), y: (2 - progress * 3.2) * height / 8,
    opacity: Math.min(1, progress * 9) };
}
function reflect(value: number, extent: number) {
  'worklet';
  const span = Math.max(1, extent - 24);
  const phase = ((value - 12) % (span * 2) + span * 2) % (span * 2);
  return 12 + (phase <= span ? phase : span * 2 - phase);
}
export function floatingNote(age: number, seed: number, x: number, y: number, width: number, height: number) {
  'worklet';
  const phase = seed * Math.PI * 2;
  const sway = (Math.sin(age * .65 + phase) - Math.sin(phase)) * (8 + seed * 12);
  return { x: reflect(x + age * (10 + seed * 8) + sway, width),
    y: reflect(y - age * (6.4 + seed * 5.6), height),
    size: (.48 + Math.min(1, age / 2) * (.35 + seed * .35)) * .88,
    rotation: Math.sin(age * .8 + phase) * .22,
    opacity: .62 + .18 * Math.sin(age * .7 + phase) };
}
