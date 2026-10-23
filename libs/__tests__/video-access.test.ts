import { isVideoAccessExpiring, videoNeedsAccess } from '../video-access';

jest.mock('../api.client', () => ({ apiClient: { get: jest.fn() } }));

describe('videoNeedsAccess', () => {
  it('asks for a signed URL behind every gate', () => {
    expect(videoNeedsAccess({ streamInfo: { isPayPerView: true } })).toBe(true);
    expect(videoNeedsAccess({ streamInfo: { isLockContent: true, lockContentAmount: 100 } })).toBe(true);
    expect(videoNeedsAccess({ streamInfo: { isLockContent: true, lockAmount: '5' } })).toBe(true);
    expect(videoNeedsAccess({ plansDetails: [{ id: '1' }] })).toBe(true);
  });

  it('asks for one for a followers-only or direct post too', () => {
    expect(videoNeedsAccess({ visibility: 'followers' })).toBe(true);
    expect(videoNeedsAccess({ visibility: 'direct' })).toBe(true);
    expect(videoNeedsAccess({ visibility: 'public' })).toBe(false);
  });

  it('plays an open post straight from the CDN', () => {
    expect(videoNeedsAccess({})).toBe(false);
    // A hold toggle with no amount is no gate at all.
    expect(videoNeedsAccess({ streamInfo: { isLockContent: true, lockContentAmount: 0 } })).toBe(false);
    expect(videoNeedsAccess({ plansDetails: [] })).toBe(false);
  });
});

describe('isVideoAccessExpiring', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  it('only blames the signature when it is about to lapse', () => {
    expect(isVideoAccessExpiring({ url: 'x', private: true, expiresAt: '2026-10-23T12:05:00Z' }, now)).toBe(true);
    expect(isVideoAccessExpiring({ url: 'x', private: true, expiresAt: '2026-10-23T18:00:00Z' }, now)).toBe(false);
    expect(isVideoAccessExpiring({ url: 'x', private: false, expiresAt: null }, now)).toBe(false);
  });
});
