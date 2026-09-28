import { pagerPageIntersectsViewport } from '../../libs/pagerVisibility';

describe('home pager draw window', () => {
  it('draws only the active page while idle', () => {
    expect([0, 1, 2, 3, 4, 5].filter(index => pagerPageIntersectsViewport(index, 2))).toEqual([2]);
  });
  it('reveals both pages during a swipe in either direction', () => {
    expect([0, 1, 2, 3, 4, 5].filter(index => pagerPageIntersectsViewport(index, 2.3))).toEqual([2, 3]);
    expect([0, 1, 2, 3, 4, 5].filter(index => pagerPageIntersectsViewport(index, 1.8))).toEqual([1, 2]);
  });
  it('keeps the edge page drawn during overscroll', () => {
    expect(pagerPageIntersectsViewport(0, -0.2)).toBe(true);
    expect(pagerPageIntersectsViewport(5, 5.2)).toBe(true);
    expect(pagerPageIntersectsViewport(1, -0.2)).toBe(false);
    expect(pagerPageIntersectsViewport(4, 5.2)).toBe(false);
  });
});
