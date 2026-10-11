import { completesSwipeBack } from '../../libs/swipe-back';

test('a deliberate swipe or short fast flick completes back', () => {
  expect(completesSwipeBack(64, 8, 0)).toBe(true);
  expect(completesSwipeBack(28, 4, 650)).toBe(true);
});
test('scrolling, taps, cancelled drags and forward swipes do not go back', () => {
  for (const [x, y, velocity] of [[20, 0, 900], [50, 0, 0], [90, 40, 800], [64, 32, 800], [-90, 0, -800]]) {
    expect(completesSwipeBack(x, y, velocity)).toBe(false);
  }
});
