import { storyboardOffset, storyboardSheetSize, toStoryboard } from '../../libs/storyboard';

const raw = { url: 'storyboards/42.jpg', spriteWidth: 108, spriteHeight: 192, spriteCount: 61, spriteDuration: 2, columns: 11 };

describe('toStoryboard', () => {
  it('resolves the sheet against the CDN', () => {
    expect(toStoryboard(raw)).toEqual({ ...raw, url: 'https://cdn.test.dehub.io/storyboards/42.jpg' });
  });

  it('skips private sheets and incomplete ones', () => {
    expect(toStoryboard({ ...raw, private: true })).toBeUndefined();
    expect(toStoryboard({ ...raw, columns: 0 })).toBeUndefined();
    expect(toStoryboard({ ...raw, url: '' })).toBeUndefined();
    expect(toStoryboard(undefined)).toBeUndefined();
  });
});

describe('storyboardOffset', () => {
  const sb = toStoryboard(raw)!;

  it('picks the sprite by column and row', () => {
    expect(storyboardOffset(sb, 0)).toEqual({ x: 0, y: 0 });
    expect(storyboardOffset(sb, 5)).toEqual({ x: 2 * 108, y: 0 });
    expect(storyboardOffset(sb, 22)).toEqual({ x: 0, y: 192 });
  });

  it('clamps to the last sprite', () => {
    // Sprite 60: column 5, row 5.
    expect(storyboardOffset(sb, 999)).toEqual({ x: 5 * 108, y: 5 * 192 });
    expect(storyboardOffset(sb, -1)).toEqual({ x: 0, y: 0 });
  });

  it('sizes the whole sheet from the grid', () => {
    expect(storyboardSheetSize(sb)).toEqual({ width: 11 * 108, height: 6 * 192 });
  });
});
