/**
 * extractUrlsFromText used to require an explicit http(s):// scheme, so a
 * bare "dehub.io/work" typed into a comment or caption never got a preview
 * card even though chat-links.ts's own linkifier already turns the exact
 * same text into a clickable link. These pin the scheme-optional match and
 * the normalization that keeps every downstream caller (the fetch, cache
 * keys) working with an absolute URL. Mirrors web's
 * src/lib/api/__tests__/link-preview.test.ts.
 */
jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

import { extractUrlsFromText, getLinkPreviewImage } from '../../libs/link-preview';

describe('shared link images', () => {
  it('keeps working Suno artwork on existing shares', () => {
    const workingShares = [
      ['0d0dab23-8785-4634-bbed-964cae4807a1', 'https://cdn2.suno.ai/image_large_2f006ae6-cd64-4793-ae9d-e1d959dfdb75.jpeg'],
      ['d8982ad1-96c2-495e-be0e-f422c32cb7a6', 'https://cdn2.suno.ai/image_large_6dd6e04f-d3df-4903-b296-5dc4e16fc6c1.jpeg'],
    ];
    for (const [album, cover] of workingShares) {
      expect(getLinkPreviewImage(`https://suno.com/album/${album}`, cover)).toBe(cover);
    }
    expect(getLinkPreviewImage('https://www.suno.com/album/shared', 'https://cdn2.suno.ai/cover.jpeg')).toBe('https://cdn2.suno.ai/cover.jpeg');
  });

  it('uses the fallback only for the known blank C Drive cover', () => {
    const album = 'https://suno.com/album/89ae6c87-c3f9-40ff-b626-f59704b6e0e9';
    expect(getLinkPreviewImage(album, 'https://cdn2.suno.ai/image_large_8b26dd51-6297-4403-9f25-e7e2e7d45c64.jpeg')).toBeNull();
    expect(getLinkPreviewImage(album, 'https://cdn2.suno.ai/replacement-cover.jpeg')).toBe('https://cdn2.suno.ai/replacement-cover.jpeg');
  });

  it('keeps ordinary preview artwork and decodes escaped image URLs', () => {
    expect(getLinkPreviewImage('https://example.com/article', 'https://example.com/cover?a=1&amp;b=2')).toBe('https://example.com/cover?a=1&b=2');
    expect(getLinkPreviewImage('https://suno.com.example.org/article', 'https://example.org/cover.jpg')).toBe('https://example.org/cover.jpg');
    expect(getLinkPreviewImage('https://example.com/article', null)).toBeNull();
  });
});

describe('extractUrlsFromText', () => {
  it('matches a scheme-less domain and normalizes it to https', () => {
    expect(extractUrlsFromText('check this out: dehub.io/work')).toEqual([
      'https://dehub.io/work',
    ]);
  });

  it('leaves an already-schemed URL as written', () => {
    expect(extractUrlsFromText('see http://dehub.io/work now')).toEqual([
      'http://dehub.io/work',
    ]);
  });

  it('strips trailing sentence punctuation before normalizing', () => {
    expect(extractUrlsFromText('link: dehub.io/work.')).toEqual(['https://dehub.io/work']);
    expect(extractUrlsFromText('is this it (dehub.io/work)?')).toEqual(['https://dehub.io/work']);
  });

  it('requires a path, so a bare domain with no slash is not a URL', () => {
    expect(extractUrlsFromText('reach out at hello@dehub.io')).toEqual([]);
  });

  it('does not match plain decimals or filenames', () => {
    expect(extractUrlsFromText('up 2.5x today, see report.pdf')).toEqual([]);
  });

  it('dedupes repeated links, keyed by the normalized form', () => {
    const found = extractUrlsFromText('dehub.io/work and again https://dehub.io/work');
    expect(found).toEqual(['https://dehub.io/work']);
  });

  it('returns an empty array for text with no links', () => {
    expect(extractUrlsFromText('just a regular sentence')).toEqual([]);
  });
});
