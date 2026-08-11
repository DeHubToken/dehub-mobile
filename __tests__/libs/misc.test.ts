import {
  getAvatarUrl, getCoverUrl, buildCdnPath, getVideoUrl,
  getShortsThumbnailUrl, getPreviewUrl, resolveThumbnail,
  getImageUrl, getExtension, buildImageUrl, getImageUrlApi,
  getImageUrlApiSimple, getAudioUrl, getBadgeName, getBadgeUrl,
  resolveBadgeBalance, getDefaultBanner,
} from '../../libs/misc';

jest.mock('../../config/env', () => ({
  __esModule: true,
  default: {
    CDN_BASE_URL: 'https://cdn.test.dehub.io',
    API_URL: 'https://api.test.dehub.io/api',
  },
}));

describe('libs/misc', () => {
  describe('getAvatarUrl', () => {
    it('returns default for null/undefined/empty', () => {
      expect(getAvatarUrl(null)).toBe('default-avatar');
      expect(getAvatarUrl(undefined)).toBe('default-avatar');
      expect(getAvatarUrl('')).toBe('default-avatar');
    });

    // Avatars are the one helper that sizes by default — they are never shown
    // larger than ~88pt, so there is no call site that wants the original. The
    // 96 is the 48pt default at the mocked DPR of 2, snapped to the ladder.
    it('extracts filename and builds a sized CDN URL', () => {
      expect(getAvatarUrl('uploads/avatars/abc.png')).toBe(
        'https://dehub.io/cdn-cgi/image/format=webp,quality=80,width=96/https://cdn.test.dehub.io/avatars/abc.png'
      );
    });

    it('handles simple filename', () => {
      expect(getAvatarUrl('user123.jpg')).toBe(
        'https://dehub.io/cdn-cgi/image/format=webp,quality=80,width=96/https://cdn.test.dehub.io/avatars/user123.jpg'
      );
    });

    it('sizes to an explicit request', () => {
      // 88pt at DPR 2 = 176px, which snaps up to the 192 rung.
      expect(getAvatarUrl('abc.png', 88)).toBe(
        'https://dehub.io/cdn-cgi/image/format=webp,quality=80,width=192/https://cdn.test.dehub.io/avatars/abc.png'
      );
    });

    it('returns the untouched original at size 0, for fullscreen viewers', () => {
      expect(getAvatarUrl('abc.png', 0)).toBe('https://cdn.test.dehub.io/avatars/abc.png');
    });
  });

  describe('getCoverUrl', () => {
    it('returns default for falsy input', () => {
      expect(getCoverUrl(null)).toBe('default-banner');
      expect(getCoverUrl(undefined)).toBe('default-banner');
    });

    it('builds CDN cover URL', () => {
      expect(getCoverUrl('covers/banner.jpg')).toBe(
        'https://cdn.test.dehub.io/covers/banner.jpg'
      );
    });
  });

  describe('buildCdnPath', () => {
    it('returns undefined for falsy', () => {
      expect(buildCdnPath(null)).toBeUndefined();
      expect(buildCdnPath(undefined)).toBeUndefined();
      expect(buildCdnPath('')).toBeUndefined();
    });

    it('prepends CDN base URL', () => {
      expect(buildCdnPath('videos/123.mp4')).toBe('https://cdn.test.dehub.io/videos/123.mp4');
    });
  });

  describe('getVideoUrl', () => {
    it('returns undefined for null/undefined', () => {
      expect(getVideoUrl(null)).toBeUndefined();
      expect(getVideoUrl(undefined)).toBeUndefined();
    });

    it('builds video URL from number tokenId', () => {
      expect(getVideoUrl(42)).toBe('https://cdn.test.dehub.io/videos/42.mp4');
    });

    it('builds video URL from string tokenId', () => {
      expect(getVideoUrl('100')).toBe('https://cdn.test.dehub.io/videos/100.mp4');
    });

    it('returns undefined for empty string', () => {
      expect(getVideoUrl('')).toBeUndefined();
      expect(getVideoUrl('   ')).toBeUndefined();
    });
  });

  describe('getShortsThumbnailUrl', () => {
    it('returns undefined for null/undefined', () => {
      expect(getShortsThumbnailUrl(null)).toBeUndefined();
      expect(getShortsThumbnailUrl(undefined)).toBeUndefined();
    });

    it('builds shorts thumbnail URL', () => {
      expect(getShortsThumbnailUrl(55)).toBe('https://cdn.test.dehub.io/shorts/55.jpg');
      expect(getShortsThumbnailUrl('55')).toBe('https://cdn.test.dehub.io/shorts/55.jpg');
    });
  });

  describe('getPreviewUrl', () => {
    it('returns undefined for falsy', () => {
      expect(getPreviewUrl(null)).toBeUndefined();
    });

    it('builds preview URL', () => {
      expect(getPreviewUrl(77)).toBe('https://cdn.test.dehub.io/previews/77.mp4');
    });
  });

  describe('resolveThumbnail', () => {
    it('returns default-banner when no thumbnail fields exist', () => {
      expect(resolveThumbnail({})).toBe('default-banner');
    });

    it('resolves from thumbnail field', () => {
      expect(resolveThumbnail({ thumbnail: 'thumbs/1.jpg' })).toBe(
        'https://cdn.test.dehub.io/thumbs/1.jpg'
      );
    });

    it('falls back through thumbnailUrl then imageUrl', () => {
      expect(resolveThumbnail({ thumbnailUrl: 'thumb.jpg' })).toBe(
        'https://cdn.test.dehub.io/thumb.jpg'
      );
      expect(resolveThumbnail({ imageUrl: 'img.jpg' })).toBe(
        'https://cdn.test.dehub.io/img.jpg'
      );
    });
  });

  describe('getImageUrl', () => {
    it('returns empty string for empty input', () => {
      expect(getImageUrl('')).toBe('');
    });

    it('leaves third-party hosts alone, sized or not', () => {
      // Only our own CDN is a permitted remote source for the transform, so a
      // width here is a no-op rather than a URL that would 404.
      expect(getImageUrl('https://example.com/img.png')).toBe('https://example.com/img.png');
      expect(getImageUrl('https://example.com/img.png', 200)).toBe(
        'https://example.com/img.png'
      );
    });

    it('builds CDN images URL for relative paths', () => {
      expect(getImageUrl('uploads/photo.jpg')).toBe(
        'https://cdn.test.dehub.io/images/photo.jpg'
      );
    });

    it('sizes the CDN URL when a width is given', () => {
      // 180pt at DPR 2 = 360px, which is on the ladder exactly.
      expect(getImageUrl('uploads/photo.jpg', 180)).toBe(
        'https://dehub.io/cdn-cgi/image/format=webp,quality=80,width=360/https://cdn.test.dehub.io/images/photo.jpg'
      );
    });
  });

  describe('getExtension', () => {
    it('extracts file extension', () => {
      expect(getExtension('photo.png')).toBe('png');
      expect(getExtension('file.JPEG')).toBe('jpeg');
    });

    it('defaults to jpg when no extension', () => {
      expect(getExtension('noextension')).toBe('jpg');
    });
  });

  describe('buildImageUrl', () => {
    it('returns empty for no apiImagePath', () => {
      expect(buildImageUrl(1, null)).toBe('');
      expect(buildImageUrl(1, undefined)).toBe('');
    });

    it('returns http URLs unchanged', () => {
      expect(buildImageUrl(1, 'https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
    });

    it('builds CDN URL with tokenId and extension', () => {
      expect(buildImageUrl(42, 'uploads/photo.png')).toBe(
        'https://cdn.test.dehub.io/images/42.png'
      );
    });
  });

  describe('getImageUrlApi', () => {
    it('builds API image URL with tokenId', () => {
      const url = getImageUrlApi(42, '0xabc');
      expect(url).toContain('/nfts/images/42');
      expect(url).toContain('address=0xabc');
    });

    it('includes width/height params', () => {
      const url = getImageUrlApi(42, '0xabc', 200, 300);
      expect(url).toContain('w=200');
      expect(url).toContain('h=300');
    });
  });

  describe('getImageUrlApiSimple', () => {
    it('prepends API base URL to path', () => {
      expect(getImageUrlApiSimple('/images/photo.jpg')).toBe(
        'https://api.test.dehub.io/api/images/photo.jpg'
      );
    });
  });

  describe('getAudioUrl', () => {
    it('returns empty for empty input', () => {
      expect(getAudioUrl('')).toBe('');
    });

    it('returns http URLs unchanged', () => {
      expect(getAudioUrl('https://example.com/audio.mp3')).toBe('https://example.com/audio.mp3');
    });

    it('prepends CDN for relative paths', () => {
      expect(getAudioUrl('audio/track.mp3')).toBe('https://cdn.test.dehub.io/audio/track.mp3');
    });

    it('strips leading slashes', () => {
      expect(getAudioUrl('/audio/track.mp3')).toBe('https://cdn.test.dehub.io/audio/track.mp3');
    });
  });

  describe('getBadgeName', () => {
    it('returns undefined below minimum threshold', () => {
      expect(getBadgeName(0)).toBeUndefined();
      expect(getBadgeName(9999)).toBeUndefined();
    });

    it('returns Crab at 10000', () => {
      expect(getBadgeName(10000)).toBe('Crab');
    });

    it('returns highest matching badge', () => {
      expect(getBadgeName(50_000_000)).toBe('Meglodon');
      expect(getBadgeName(5_000_000)).toBe('Killer Whale');
    });

    it('handles string input', () => {
      expect(getBadgeName('100000')).toBe('Tortoise');
    });

    it('returns undefined for NaN/Infinity', () => {
      expect(getBadgeName('not-a-number')).toBeUndefined();
      expect(getBadgeName(Infinity)).toBeUndefined();
    });
  });

  describe('resolveBadgeBalance', () => {
    it('returns 0 for null/undefined', () => {
      expect(resolveBadgeBalance(null)).toBe(0);
      expect(resolveBadgeBalance(undefined)).toBe(0);
    });

    it('returns badgeBalance first', () => {
      expect(resolveBadgeBalance({ badgeBalance: 500, stakedDHB: 100 })).toBe(500);
    });

    it('falls through stakedDHB → staked → minterStaked', () => {
      expect(resolveBadgeBalance({ stakedDHB: 200 })).toBe(200);
      expect(resolveBadgeBalance({ staked: 300 })).toBe(300);
      expect(resolveBadgeBalance({ minterStaked: 400 })).toBe(400);
    });

    it('returns 0 when no balance fields', () => {
      expect(resolveBadgeBalance({ name: 'user' })).toBe(0);
    });

    it('skips zero values', () => {
      expect(resolveBadgeBalance({ badgeBalance: 0, stakedDHB: 0, staked: 50 })).toBe(50);
    });
  });

  describe('getDefaultBanner', () => {
    it('returns first banner for empty identifier', () => {
      const banner = getDefaultBanner('');
      expect(banner).toBeDefined();
    });

    it('returns deterministic banner for same identifier', () => {
      const a = getDefaultBanner('user123');
      const b = getDefaultBanner('user123');
      expect(a).toBe(b);
    });

    it('returns a value for any identifier', () => {
      const a = getDefaultBanner('alice');
      const b = getDefaultBanner('bob');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
    });
  });
});
