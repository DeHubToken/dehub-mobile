import { hintedImageRatio, noteImageSizes } from '../libs/image-size-hints';

describe('image size hints', () => {
  it('reads sizes from feed pages, single posts and quoted posts, by file name', () => {
    noteImageSizes({ result: [
      { tokenId: 1, imageSizes: [{ f: '1-1.jpg', w: 1200, h: 800 }] },
      { tokenId: 2, quotedPost: { imageSizes: [{ f: '9-1.webp', w: 500, h: 1000 }] } },
    ] });
    noteImageSizes({ result: { imageSizes: [{ f: '3-1.jpg', w: 100, h: 100 }, { f: 'bad.jpg', w: 0, h: 5 }] } });

    expect(hintedImageRatio('https://riftn.com/cdn-cgi/image/format=auto,width=1080/https://cdn.test/feed-images/1-1.jpg')).toBe(1.5);
    expect(hintedImageRatio('https://cdn.test/feed-images/9-1.webp?X-Amz-Signature=abc')).toBe(0.5);
    expect(hintedImageRatio('https://api.dehub.io/api/nfts/images/3-1.jpg')).toBe(1);
    expect(hintedImageRatio('https://cdn.test/feed-images/bad.jpg')).toBeUndefined();
    expect(hintedImageRatio('https://cdn.test/feed-images/other.jpg')).toBeUndefined();
  });
});
