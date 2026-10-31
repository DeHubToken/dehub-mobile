import { galleryDrawnSlides } from '../../libs/gallery-window';

describe('galleryDrawnSlides', () => {
  it('draws the photo on each side of the view', () => {
    expect(galleryDrawnSlides([], [0], 5)).toEqual([0, 1]);
    expect(galleryDrawnSlides([], [2], 5)).toEqual([1, 2, 3]);
    expect(galleryDrawnSlides([], [4], 5)).toEqual([3, 4]);
  });

  it('keeps photos already drawn while swiping back and forth', () => {
    let drawn = galleryDrawnSlides([], [0], 5);
    for (const index of [1, 2, 3, 4]) drawn = galleryDrawnSlides(drawn, [index], 5);
    expect(drawn).toEqual([1, 2, 3, 4]);
    expect(galleryDrawnSlides(drawn, [3], 5)).toEqual([1, 2, 3, 4]);
    expect(galleryDrawnSlides(drawn, [2], 5)).toEqual([1, 2, 3, 4]);
  });

  it('lets go of photos far from the view in a long gallery', () => {
    let drawn = galleryDrawnSlides([], [0], 40);
    for (let index = 1; index <= 20; index++) drawn = galleryDrawnSlides(drawn, [index], 40);
    expect(drawn).toEqual([17, 18, 19, 20, 21]);
  });
});
