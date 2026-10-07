import { renderHook, waitFor } from '@testing-library/react-native';

const mockGetAccount = jest.fn();

jest.mock('../../services/user.service', () => ({
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  removeFollower: jest.fn(),
}));
jest.mock('../../services/block.service', () => ({ blockUser: jest.fn(), unblockUser: jest.fn() }));
jest.mock('../../libs', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
jest.mock('../../libs/error-feedback', () => ({ reportActionError: jest.fn() }));
jest.mock('../../config', () => ({ WEBSITE_LINK: 'https://dehub.io' }));
jest.mock('../../context/AuthContext', () => ({
  useUser: () => null,
  useAuthActions: () => ({ requireAuth: jest.fn(), patchUser: jest.fn() }),
}));
jest.mock('../../hooks/useDM', () => ({ useDM: () => ({ conversations: [] }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

import { useUserProfileData, type RemoteUser } from '../../hooks/useUserProfileData';
import { badgeImage, MAX_BADGE_SCALE, setActiveBadgeScale } from '../../libs/misc';

beforeEach(() => {
  mockGetAccount.mockReset();
  setActiveBadgeScale(MAX_BADGE_SCALE);
});

async function loadProfile(lookup: string, account: RemoteUser) {
  mockGetAccount.mockResolvedValueOnce({ result: account });
  const hook = renderHook(() => useUserProfileData(true, lookup));
  await waitFor(() => expect(hook.result.current.data).toEqual(account));
  return hook;
}

describe('profile badges', () => {
  it('shows Algiers gifted King Cobra when opened by wallet with a balance below entry', async () => {
    const { result } = await loadProfile('0xalgiers', {
      address: '0xalgiers', username: 'algiers', badgeBalance: 943.62, badgeLock: null,
    });

    expect(result.current.profileData?.badge).toBe('King Cobra');
    expect(result.current.profileData?.badgeImage).toBe(badgeImage('King Cobra'));
    expect(result.current.profileData?.stakedDHB).toBe(943.62);
  });

  it('keeps an earned badge higher than the gift', async () => {
    const { result } = await loadProfile('dehubprime', {
      address: '0xprime', username: 'dehubprime', badgeBalance: 2_000_000,
    });

    expect(result.current.profileData?.badge).toBe('Dolphin');
    expect(result.current.profileData?.badgeImage).toBe(badgeImage('Dolphin'));
  });

  it('keeps a grandfathered badge higher than the gift', async () => {
    const { result } = await loadProfile('infinitebaffle', {
      address: '0xbaffle', username: 'infinitebaffle', badgeBalance: 10_000,
      badgeLock: { tier: 'Killer Whale', requirement: 10_000 },
    });

    expect(result.current.profileData?.badge).toBe('Killer Whale');
    expect(result.current.profileData?.badgeImage).toBe(badgeImage('Killer Whale'));
  });

  it('leaves an account with no gift or qualifying balance without a badge', async () => {
    const { result } = await loadProfile('not-granted-profile', {
      address: '0xplain', username: 'not-granted-profile', badgeBalance: 0,
    });

    expect(result.current.profileData?.badge).toBeUndefined();
    expect(result.current.profileData?.badgeImage).toBeUndefined();
  });
});
