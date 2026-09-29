import { PixelRatio } from 'react-native';
import {
  cdnImage,
  cdnImageSource,
  setHighQualityImages,
  storageImage,
  storageImageSource,
  withStorageImageHeaders,
  STORAGE_IMAGE_HEADERS,
} from '../../libs/cdnImage';

jest.mock('../../config/env', () => ({
  __esModule: true,
  default: {
    CDN_BASE_URL: 'https://cdn.test.dehub.io',
    API_URL: 'https://api.test.dehub.io/api',
  },
}));

const STORAGE = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1';
const BANNER = `${STORAGE}/object/public/community-media/dehub-debates/banner.png`;
const rendered = (width: number, query = '?') =>
  `${STORAGE}/render/image/public/community-media/dehub-debates/banner.png${query}width=${width}&quality=80&resize=contain`;

describe('storageImage', () => {
  // The setup mock reports a 2x screen.
  afterEach(() => {
    setHighQualityImages(false);
    (PixelRatio.get as jest.Mock).mockReturnValue(2);
  });

  it('routes a public storage object through the resizer, keeping its aspect ratio', () => {
    // 360pt x 2 = 720 device px, snapped up the shared width ladder.
    expect(storageImage(BANNER, 360)).toBe(rendered(828));
    expect(storageImage(BANNER, 48)).toBe(rendered(96));
  });

  it('caps the device pixel ratio at 3', () => {
    (PixelRatio.get as jest.Mock).mockReturnValue(4);
    // 360 x 3 = 1080, where an uncapped 4x would ask for 1440.
    expect(storageImage(BANNER, 360)).toBe(rendered(1080));
  });

  it('appends to an existing query string', () => {
    expect(storageImage(`${BANNER}?t=1`, 48)).toBe(rendered(96, '?t=1&'));
  });

  it('leaves everything it cannot or should not resize untouched', () => {
    expect(storageImage(undefined, 96)).toBeUndefined();
    expect(storageImage(null, 96)).toBeUndefined();
    expect(storageImage(BANNER)).toBe(BANNER);
    expect(storageImage(BANNER, 0)).toBe(BANNER);
    const cases = [
      'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/1.jpg',
      'file:///data/user/0/preview.jpg',
      `${STORAGE}/object/public/community-media/x/avatar.gif`,
      `${STORAGE}/object/public/community-media/x/logo.svg`,
      // Another project's storage may not have transformations enabled.
      'https://otherproject.supabase.co/storage/v1/object/public/a/b.png',
    ];
    for (const url of cases) expect(storageImage(url, 96)).toBe(url);
  });

  it('respects the high-quality override', () => {
    setHighQualityImages(true);
    expect(storageImage(BANNER, 360)).toBe(BANNER);
  });

  it('is what cdnImage does with a sized storage URL', () => {
    expect(cdnImage(BANNER, { width: 360 })).toBe(rendered(828));
    expect(cdnImage(BANNER)).toBe(BANNER);
  });

  it('can be undone for the fullscreen viewer', () => {
    expect(cdnImageSource(storageImage(BANNER, 360))).toBe(BANNER);
    expect(cdnImageSource(storageImage(`${BANNER}?t=1`, 48))).toBe(`${BANNER}?t=1`);
  });
});

describe('storage image headers', () => {
  // Without an Accept that names WebP the resizer answers in the source format:
  // an 865 KB PNG where the same request with the header is a 58 KB WebP.
  it('asks for WebP on resized storage sources only', () => {
    expect(storageImageSource(BANNER, 360)).toEqual({
      uri: rendered(828),
      headers: STORAGE_IMAGE_HEADERS,
    });
    expect(STORAGE_IMAGE_HEADERS.Accept).toMatch(/image\/webp/);

    const cdn = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/1.jpg';
    expect(storageImageSource(cdn, 360)).toEqual({ uri: cdn });
    expect(storageImageSource(null, 360)).toBeUndefined();
  });

  it('passes every other kind of source through as given', () => {
    const own = { uri: rendered(96), headers: { Authorization: 'x' } };
    expect(withStorageImageHeaders(own)).toBe(own);
    expect(withStorageImageHeaders(12)).toBe(12);
    expect(withStorageImageHeaders(undefined)).toBeUndefined();
    const list = [{ uri: rendered(96) }];
    expect(withStorageImageHeaders(list)).toBe(list);
    expect(withStorageImageHeaders({ uri: rendered(96) })).toEqual({
      uri: rendered(96),
      headers: STORAGE_IMAGE_HEADERS,
    });
  });
});
