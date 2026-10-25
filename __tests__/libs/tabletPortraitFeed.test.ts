import { isTabletPortraitFeed, tabletPortraitTitleSize } from '../../libs/tablet-portrait-feed';

describe('tablet portrait feed', () => {
  it.each([
    [390, 348, false, false],
    [559, 517, false, false],
    [560, 518, false, true],
    [617, 575, false, true],
    [640, 598, false, true],
    [767, 740, false, true],
    [768, 720, false, true],
    [834, 786, false, true],
    [1024, 976, false, true],
    [1366, 1318, false, true],
    [1367, 1319, false, false],
    [617, 499, false, false],
    [617, 575, true, false],
    [1024, 720, true, false],
    [1194, 500, true, false],
  ])('gates viewport %s, column %s, panels %s', (width, column, panels, expected) => {
    expect(isTabletPortraitFeed(width as number, column as number, panels as boolean)).toBe(expected);
  });

  it('gives short titles emphasis and returns long titles to normal post size', () => {
    expect(tabletPortraitTitleSize('A different side of Tokyo')).toBe(26);
    const medium = tabletPortraitTitleSize('A slower evening walk through the quieter streets of Tokyo');
    expect(medium).toBeGreaterThan(17);
    expect(medium).toBeLessThan(26);
    expect(tabletPortraitTitleSize('An evening walk through the quieter streets of Tokyo, meeting the people and places that keep this city alive')).toBe(17);
    expect(tabletPortraitTitleSize('Short title', 16.8)).toBe(26);
  });

  it('handles long unbroken words, multiline titles and Unicode without oversized text', () => {
    expect(tabletPortraitTitleSize('x'.repeat(25))).toBe(17);
    expect(tabletPortraitTitleSize('One\nTwo')).toBe(17);
    expect(tabletPortraitTitleSize('')).toBe(17);
    expect(tabletPortraitTitleSize('🎥 '.repeat(16).trim())).toBe(26);
  });
});
