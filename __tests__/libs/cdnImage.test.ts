import {
  cdnImage,
  toDevicePx,
  isHighQualityImages,
  setHighQualityImages,
  onHighQualityImagesChange,
} from '../../libs/cdnImage';

jest.mock('../../config/env', () => ({
  __esModule: true,
  default: {
    CDN_BASE_URL: 'https://cdn.test.dehub.io',
    API_URL: 'https://api.test.dehub.io/api',
  },
}));

const CDN = 'https://cdn.test.dehub.io/images/1.jpg';
const transformed = (width: number, url = CDN, quality = 80) =>
  `https://dehub.io/cdn-cgi/image/format=webp,quality=${quality},width=${width}/${url}`;

describe('libs/cdnImage', () => {
  // The module caches the preference on first read, and these tests flip it.
  afterEach(() => setHighQualityImages(false));

  describe('the no-width rule', () => {
    // This is the property the whole rollout rests on: ~100 call sites were
    // converted at once, and any of them that does not state a size must come
    // out of this function completely unchanged.
    it('returns the original when no width is given', () => {
      expect(cdnImage(CDN)).toBe(CDN);
      expect(cdnImage(CDN, {})).toBe(CDN);
      expect(cdnImage(CDN, { quality: 50 })).toBe(CDN);
    });

    it('treats width 0 as "give me the original"', () => {
      expect(cdnImage(CDN, { width: 0 })).toBe(CDN);
    });

    it('passes falsy input straight through', () => {
      expect(cdnImage(undefined)).toBeUndefined();
      expect(cdnImage('')).toBe('');
    });
  });

  describe('the own-CDN-only rule', () => {
    // The zone allows the Spaces host as a remote source and nothing else, so
    // rewriting any other host would produce a URL that 404s.
    it('leaves the API host alone', () => {
      const api = 'https://api.test.dehub.io/api/nfts/images/1';
      expect(cdnImage(api, { width: 180 })).toBe(api);
    });

    it('leaves third-party and local sources alone', () => {
      const cases = [
        'https://example.com/a.jpg',
        'file:///var/tmp/photo.jpg',
        'data:image/png;base64,AAAA',
        'content://media/external/images/1',
      ];
      for (const url of cases) expect(cdnImage(url, { width: 180 })).toBe(url);
    });

    it('also accepts the known production CDN host', () => {
      // CDN_BASE_URL comes from .env; an unset value must not silently disable
      // transforms for every build that forgot it.
      const prod = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/a.png';
      expect(cdnImage(prod, { width: 32 })).toBe(transformed(64, prod));
    });
  });

  describe('formats that must not be resized', () => {
    it('passes SVG and GIF through', () => {
      const svg = 'https://cdn.test.dehub.io/icons/a.svg';
      const gif = 'https://cdn.test.dehub.io/images/a.gif';
      expect(cdnImage(svg, { width: 64 })).toBe(svg);
      expect(cdnImage(gif, { width: 64 })).toBe(gif);
      // ...including with a query string after the extension.
      expect(cdnImage(`${gif}?v=2`, { width: 64 })).toBe(`${gif}?v=2`);
    });
  });

  describe('sizing', () => {
    // The react-native mock pins PixelRatio.get() to 2.
    it('converts CSS points to device pixels', () => {
      expect(toDevicePx(48)).toBe(96);
    });

    it('snaps to the width ladder rather than emitting one variant per device', () => {
      // 100pt -> 200px -> the 256 rung; 90pt -> 180px -> the 192 rung.
      expect(cdnImage(CDN, { width: 100 })).toBe(transformed(256));
      expect(cdnImage(CDN, { width: 90 })).toBe(transformed(192));
    });

    it('clamps to the top of the ladder', () => {
      expect(cdnImage(CDN, { width: 4000 })).toBe(transformed(2048));
    });

    it('honours an explicit quality', () => {
      expect(cdnImage(CDN, { width: 32, quality: 60 })).toBe(transformed(64, CDN, 60));
    });

    it('only emits fit when asked', () => {
      expect(cdnImage(CDN, { width: 32 })).not.toContain('fit=');
      expect(cdnImage(CDN, { width: 32, fit: 'contain' })).toContain('fit=contain');
    });
  });

  describe('the high-quality escape hatch', () => {
    it('defaults to off', () => {
      expect(isHighQualityImages()).toBe(false);
    });

    it('returns originals for every sized call once on', () => {
      setHighQualityImages(true);
      expect(isHighQualityImages()).toBe(true);
      expect(cdnImage(CDN, { width: 32 })).toBe(CDN);
    });

    it('notifies subscribers so mounted screens can re-render', () => {
      const listener = jest.fn();
      const unsubscribe = onHighQualityImagesChange(listener);

      setHighQualityImages(true);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      setHighQualityImages(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('survives a listener that throws', () => {
      const good = jest.fn();
      const unsubBad = onHighQualityImagesChange(() => {
        throw new Error('boom');
      });
      const unsubGood = onHighQualityImagesChange(good);

      expect(() => setHighQualityImages(true)).not.toThrow();
      expect(good).toHaveBeenCalled();

      unsubBad();
      unsubGood();
    });
  });
});
