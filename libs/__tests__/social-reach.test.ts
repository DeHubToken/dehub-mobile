import {
  MAX_SOCIAL_FOLLOWERS,
  computeSocialReach,
  emptySocialFollowerInputs,
  hasSocialReach,
  mergeSocialFollowers,
  parseFollowerCount,
  readSocialFollowerInputs,
  sanitizeFollowerInput,
} from '../social-reach';

describe('parseFollowerCount', () => {
  it('accepts the number the API stores and the digits a field holds', () => {
    expect(parseFollowerCount(12500)).toBe(12500);
    expect(parseFollowerCount('12500')).toBe(12500);
    expect(parseFollowerCount(' 12,500 ')).toBe(12500);
    expect(parseFollowerCount('0')).toBe(0);
  });

  it('rejects anything that is not a whole non-negative count', () => {
    expect(parseFollowerCount('')).toBeNull();
    expect(parseFollowerCount('abc')).toBeNull();
    expect(parseFollowerCount('-5')).toBeNull();
    expect(parseFollowerCount(-5)).toBeNull();
    expect(parseFollowerCount(1.5)).toBeNull();
    expect(parseFollowerCount(Number.NaN)).toBeNull();
    expect(parseFollowerCount(MAX_SOCIAL_FOLLOWERS + 1)).toBeNull();
    expect(parseFollowerCount(null)).toBeNull();
  });

  it('strips everything but digits from a keystroke', () => {
    expect(sanitizeFollowerInput('12,500 ')).toBe('12500');
    expect(sanitizeFollowerInput('-3e5')).toBe('35');
  });
});

describe('computeSocialReach', () => {
  it('reads links top level and counts from customs, in platform order', () => {
    const reach = computeSocialReach(
      {
        youtubeLink: 'https://youtube.com/@dehub',
        twitterLink: 'https://x.com/dehub',
        customs: { twitterFollowers: 1200, youtubeFollowers: '3400', followVisibility: 'public' },
      },
      150,
    );
    expect(reach.dehub).toBe(150);
    expect(reach.socials.map((s) => [s.platform, s.count])).toEqual([
      ['twitter', 1200],
      ['youtube', 3400],
    ]);
    expect(reach.total).toBe(150 + 1200 + 3400);
    expect(hasSocialReach(reach)).toBe(true);
  });

  it('ignores a count whose link is empty, and zero or malformed counts', () => {
    const reach = computeSocialReach(
      {
        twitterLink: '   ',
        instagramLink: 'instagram.com/a',
        tiktokLink: 'tiktok.com/@a',
        customs: { twitterFollowers: 9000, instagramFollowers: 0, tiktokFollowers: 'lots' },
      },
      10,
    );
    expect(reach.socials).toEqual([]);
    expect(reach.total).toBe(10);
    expect(hasSocialReach(reach)).toBe(false);
  });

  it('treats a missing profile or follower count as zero', () => {
    expect(computeSocialReach(undefined, undefined)).toEqual({ dehub: 0, socials: [], total: 0 });
    expect(computeSocialReach({ twitterLink: 'x', customs: { twitterFollowers: 7 } }, null).total).toBe(7);
  });
});

describe('readSocialFollowerInputs', () => {
  it('seeds a form with stored counts as digits and empty strings elsewhere', () => {
    const inputs = readSocialFollowerInputs({ twitterFollowers: 1200, discordFollowers: 'bad' });
    expect(inputs.twitter).toBe('1200');
    expect(inputs.discord).toBe('');
    expect(inputs.facebook).toBe('');
  });
});

describe('mergeSocialFollowers', () => {
  const links = { twitter: 'https://x.com/dehub', instagram: '', tiktok: 'https://tiktok.com/@dehub' };

  it('keeps every unrelated customs key and writes counts as numbers', () => {
    const merged = mergeSocialFollowers(
      { followVisibility: 'hidden', defaultProfileTab: 'posts' },
      { ...emptySocialFollowerInputs(), twitter: '12,500', tiktok: '300' },
      links,
    );
    expect(merged).toEqual({
      followVisibility: 'hidden',
      defaultProfileTab: 'posts',
      twitterFollowers: 12500,
      tiktokFollowers: 300,
    });
  });

  it('drops the key for a cleared count, a zero, or a platform whose link is empty', () => {
    const merged = mergeSocialFollowers(
      { twitterFollowers: 900, instagramFollowers: 800, tiktokFollowers: 700 },
      { ...emptySocialFollowerInputs(), twitter: '', instagram: '500', tiktok: '0' },
      links,
    );
    expect(merged).toEqual({});
  });
});
