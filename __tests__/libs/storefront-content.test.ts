jest.mock('../../context/AuthContext', () => ({ useUser: jest.fn(), useProvider: jest.fn() }));

import { computeStreamAccessInfo } from '../../libs/validators.util';
import { isPostHiddenByStorefront } from '../../libs/storefront-content';

const post = { tokenId: 123, streamInfo: { isPayPerView: true } };

describe('iOS feed access', () => {
  it.each([{ isOwner: true }, { isUnlocked: true }])('shows existing PPV entitlement %j', entitlement => {
    const access = computeStreamAccessInfo({ ...post, ...entitlement }, null, 56);
    expect(isPostHiddenByStorefront(false, access, false)).toBe(false);
  });

  it('keeps locked PPV unavailable while preserving a confirmed local unlock', () => {
    const access = computeStreamAccessInfo(post, null, 56);
    expect(isPostHiddenByStorefront(false, access, false)).toBe(true);
    expect(isPostHiddenByStorefront(false, access, false, true)).toBe(false);
    expect(isPostHiddenByStorefront(true, access, false)).toBe(false);
  });

  it('does not bypass a separate subscription gate or expose bounty entries', () => {
    const access = computeStreamAccessInfo({ ...post, isUnlocked: true }, null, 56);
    expect(isPostHiddenByStorefront(false, access, true)).toBe(true);
    access.streamStatus!.isLockedWithSubscription = true;
    expect(isPostHiddenByStorefront(false, access, false, true)).toBe(true);
  });
});
