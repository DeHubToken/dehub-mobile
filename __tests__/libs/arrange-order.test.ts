import { dragTargetIndex, moveItem } from '../../libs/arrange-order';

describe('arrange order', () => {
  it('moves a post up and down the list', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('turns finger travel into a row and stops at the ends', () => {
    expect(dragTargetIndex(2, -70, 64, 5)).toBe(1);
    expect(dragTargetIndex(2, 20, 64, 5)).toBe(2);
    expect(dragTargetIndex(2, 1000, 64, 5)).toBe(4);
    expect(dragTargetIndex(2, -1000, 64, 5)).toBe(0);
  });
});
