import { PULL_REFRESH_THRESHOLD, pillPullVisual, pullForDrag, pullSpringProgress } from '../../libs/pill-pull-motion';

it('keeps short pulls below release and a deliberate pull above it', () => {
  expect(pullForDrag(80)).toBeLessThan(PULL_REFRESH_THRESHOLD);
  expect(pullForDrag(200)).toBeGreaterThan(PULL_REFRESH_THRESHOLD);
  expect(pullForDrag(10000)).toBeLessThanOrEqual(165);
});
it('springs a little past rest, then settles exactly on it', () => {
  const curve = Array.from({ length: 101 }, (_, i) => pullSpringProgress(i / 100));
  expect(curve[0]).toBe(0); expect(curve[100]).toBe(1);
  expect(curve[1]).toBeLessThan(.01);
  const peak = Math.max(...curve);
  expect(peak).toBeGreaterThan(1.02);
  expect(peak).toBeLessThan(1.05);
  curve.slice(1, curve.indexOf(peak)).forEach((value, i) => expect(value).toBeGreaterThanOrEqual(curve[i]));
  curve.slice(90).forEach(value => expect(Math.abs(value - 1)).toBeLessThan(.01));
});
it('keeps the echo inside the gap and the glow quiet at rest', () => {
  expect(pillPullVisual(0, false, false, 0).rimOpacity).toBe(0);
  for (const distance of [2, 20, 92, 165]) {
    const visual = pillPullVisual(distance, false, true, .4);
    expect(visual.echoOffset).toBeLessThan(visual.gapHeight);
    expect(visual.echoOpacity).toBeLessThan(.18);
  }
});
