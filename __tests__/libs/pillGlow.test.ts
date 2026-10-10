import { pillGlowColor, pillGlowStrength } from '../../libs/pill-glow';
import { PULL_REFRESH_THRESHOLD } from '../../libs/pill-pull-motion';

it('brightens with the pull and holds full past the refresh point', () => {
  expect(pillGlowStrength(0, 0)).toBe(0);
  expect(pillGlowStrength(PULL_REFRESH_THRESHOLD / 2, 0)).toBeCloseTo(.5);
  expect(pillGlowStrength(165, 0)).toBe(1);
});
it('keeps the refresh breath once the pull has settled', () => {
  expect(pillGlowStrength(0, .38)).toBe(.38);
  expect(pillGlowStrength(PULL_REFRESH_THRESHOLD, .38)).toBe(1);
});
it('lights each theme in its own colour', () => {
  expect(pillGlowColor('system', [161, 161, 170]).color).toEqual([228, 240, 255]);
  expect(pillGlowColor('minimal', [161, 161, 170]).gain).toBeLessThan(1);
  const osaka = pillGlowColor('osaka', [255, 111, 181]).color;
  expect(osaka[0]).toBeGreaterThan(osaka[1]);
});
