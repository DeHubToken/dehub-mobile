import { completesSwipeBack, pageSwipeAllowed, settlesSwipeBack, swipeBackProgress, SWIPE_BACK_SPRING } from '../../libs/swipe-back';

test('a deliberate swipe or short fast flick completes back', () => {
  expect(completesSwipeBack(64, 8, 0)).toBe(true);
  expect(completesSwipeBack(28, 4, 650)).toBe(true);
});
test('scrolling, taps, cancelled drags and forward swipes do not go back', () => {
  for (const [x, y, velocity] of [[20, 0, 900], [50, 0, 0], [90, 40, 800], [64, 32, 800], [-90, 0, -800]]) {
    expect(completesSwipeBack(x, y, velocity)).toBe(false);
  }
});

test('a drag across the page needs a longer pull than the edge', () => {
  expect(completesSwipeBack(70, 0, 0, 88)).toBe(false);
  expect(completesSwipeBack(96, 20, 0, 88)).toBe(true);
});
test('a page drag never starts on a sideways list, field or slider', () => {
  const node = (nodeName: string, parentNode: object | null = null) => ({ nodeName, parentNode });
  const page = node('RN:View', node('RN:ScrollView', node('RN:View')));
  expect(pageSwipeAllowed(node('RN:Paragraph', page))).toBe(true);
  // However far it reports being scrolled: Android reads 0 mid-carousel.
  for (const scrollLeft of [0, 120, undefined]) {
    const row = { nodeName: 'RN:AndroidHorizontalScrollView', parentNode: page, scrollLeft };
    expect(pageSwipeAllowed(node('RN:Image', row))).toBe(false);
  }
  const shell = node('RN:ViewPager');
  const boundary = node('RN:View', shell);
  expect(pageSwipeAllowed(node('RN:Paragraph', boundary), boundary)).toBe(true);
  expect(pageSwipeAllowed(node('RN:Paragraph', boundary))).toBe(false);
  expect(pageSwipeAllowed(node('RN:AndroidTextInput', page))).toBe(false);
  expect(pageSwipeAllowed(42)).toBe(false);
  expect(pageSwipeAllowed({})).toBe(true);
  expect(pageSwipeAllowed(null)).toBe(false);
});

describe('interactive edge back', () => {
  const width = 400;
  test('a page dragged most of the way, or carried there by its flick, leaves', () => {
    expect(settlesSwipeBack(170, 0, width)).toBe(true);
    expect(settlesSwipeBack(120, 400, width)).toBe(true);
    expect(settlesSwipeBack(30, 900, width)).toBe(true);
  });
  test('a short or slow drag springs home', () => {
    expect(settlesSwipeBack(100, 0, width)).toBe(false);
    expect(settlesSwipeBack(150, 50, width)).toBe(false);
    expect(settlesSwipeBack(12, 900, width)).toBe(false);
    expect(settlesSwipeBack(0, 2000, width)).toBe(false);
  });
  test('a flick back toward the edge cancels however far the page came', () => {
    expect(settlesSwipeBack(350, -400, width)).toBe(false);
    expect(settlesSwipeBack(350, -100, width)).toBe(true);
  });
  test('an unmeasured screen never leaves', () => {
    expect(settlesSwipeBack(300, 900, 0)).toBe(false);
  });
  test('progress is clamped to the screen', () => {
    expect(swipeBackProgress(-20, width)).toBe(0);
    expect(swipeBackProgress(200, width)).toBe(0.5);
    expect(swipeBackProgress(900, width)).toBe(1);
    expect(swipeBackProgress(50, 0)).toBe(0);
  });
  test('the settle spring never passes either end', () => {
    expect(SWIPE_BACK_SPRING.overshootClamping).toBe(true);
  });
});
