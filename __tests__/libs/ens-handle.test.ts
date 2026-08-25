/**
 * `dehub.io/mal.eth` has to be a profile, and `dehub.io/favicon.ico` must not.
 *
 * This is the mobile half of a rule that lives in two repos. dehubweb's edge
 * worker decided "is this a profile?" with a bare "does the first segment
 * contain a dot?" in four places, which is why a `.eth` handle unfurled as the
 * homepage while the same account at `/mal` rendered a proper card. The
 * carve-out is deliberately narrow — `.eth` and nothing else — because the dot
 * test is load-bearing for every real static asset. These tests pin both
 * halves: the new namespace resolves, and nothing else moved.
 */
import {
  ENS_SUFFIX,
  couldBeProfileSegment,
  ensProfileUrl,
  isEnsHandle,
} from '../../libs/ens-handle';

const RESERVED = ['app', 'arcade', 'stage', 'stages', 'usernames', 'builder'];

describe('isEnsHandle', () => {
  it('accepts a .eth name in any case', () => {
    expect(isEnsHandle('mal.eth')).toBe(true);
    expect(isEnsHandle('MAL.ETH')).toBe(true);
    // Subdomains are real ENS names and resolve like any other.
    expect(isEnsHandle('sub.mal.eth')).toBe(true);
  });

  it('accepts a percent-encoded name', () => {
    // ENS names may be non-ASCII, and a deep link can still carry one encoded.
    // A charset regex here would reject exactly the names that most need this.
    expect(isEnsHandle('%d9%85%d8%b1%d8%ad%d8%a8%d8%a7.eth')).toBe(true);
  });

  it('rejects the bare suffix and anything shorter', () => {
    expect(isEnsHandle(ENS_SUFFIX)).toBe(false);
    expect(isEnsHandle('eth')).toBe(false);
    expect(isEnsHandle('')).toBe(false);
    expect(isEnsHandle(null)).toBe(false);
    expect(isEnsHandle(undefined)).toBe(false);
  });

  it('rejects every other extension', () => {
    // The whole risk of this change is widening what counts as a profile, so
    // the things that must still be read as files are named explicitly.
    for (const asset of [
      'favicon.ico',
      'robots.txt',
      'sitemap.xml',
      'manifest.webmanifest',
      'dehub.apk',
      'og-image.png',
      'index.html',
      'apple-app-site-association.json',
      'dehub.io',
      'name.ethx',
      'name.eth.png',
    ]) {
      expect(isEnsHandle(asset)).toBe(false);
    }
  });
});

describe('couldBeProfileSegment', () => {
  it('treats a .eth handle as a profile', () => {
    expect(couldBeProfileSegment('mal.eth', RESERVED)).toBe(true);
  });

  it('treats a plain username as a profile', () => {
    expect(couldBeProfileSegment('mal', RESERVED)).toBe(true);
    expect(couldBeProfileSegment('satoshi_2', RESERVED)).toBe(true);
  });

  it('never treats a product path as a profile, whatever its case', () => {
    expect(couldBeProfileSegment('arcade', RESERVED)).toBe(false);
    expect(couldBeProfileSegment('Arcade', RESERVED)).toBe(false);
    expect(couldBeProfileSegment('USERNAMES', RESERVED)).toBe(false);
  });

  it('never treats a dotted non-ENS segment as a profile', () => {
    // These used to open an empty profile sheet for @favicon.ico. Usernames
    // cannot contain a dot, so nothing real is lost by refusing them.
    expect(couldBeProfileSegment('favicon.ico', RESERVED)).toBe(false);
    expect(couldBeProfileSegment('apple-app-site-association', RESERVED)).toBe(true);
    expect(couldBeProfileSegment('.well-known', RESERVED)).toBe(false);
  });

  it('rejects an empty segment', () => {
    expect(couldBeProfileSegment('', RESERVED)).toBe(false);
    expect(couldBeProfileSegment(null, RESERVED)).toBe(false);
  });

  it('accepts a reserved list given as a Set', () => {
    expect(couldBeProfileSegment('app', new Set(['app']))).toBe(false);
    expect(couldBeProfileSegment('mal', new Set(['app']))).toBe(true);
  });
});

describe('ensProfileUrl', () => {
  it('builds the URL the name earns its holder', () => {
    expect(ensProfileUrl('mal.eth')).toBe('https://dehub.io/mal.eth');
  });

  it('encodes a non-ASCII name', () => {
    expect(ensProfileUrl('مرحبا.eth')).toBe('https://dehub.io/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7.eth');
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(ensProfileUrl('mal.eth', 'https://dehub.io/')).toBe('https://dehub.io/mal.eth');
  });
});
