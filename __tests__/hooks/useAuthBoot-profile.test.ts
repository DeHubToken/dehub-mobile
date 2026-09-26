import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuthBoot } from '../../hooks/useAuthBoot';
jest.mock('../../libs/auth.utils', () => ({ isTokenExpired: () => false }));
jest.mock('../../libs/token-refresh', () => ({ tokenRefreshManager: { attemptRefresh: jest.fn() } }));
it('does not overwrite a corrected profile with the old owner profile on boot', async () => {
  const deps = { getAuthUser: jest.fn().mockResolvedValue({ username: 'kolomba' }), getAuthToken: jest.fn().mockResolvedValue('old-token'), hasSeenAuth: jest.fn().mockResolvedValue(true), setUser: jest.fn(), setIsSignedIn: jest.fn(), setIsFirstTimeUser: jest.fn(), setIsBootLoading: jest.fn(), ensureProvider: jest.fn().mockResolvedValue(undefined), reconcileProfile: jest.fn().mockResolvedValue(true), log: { warn: jest.fn(), error: jest.fn() } };
  renderHook(() => useAuthBoot(deps));
  await waitFor(() => expect(deps.setIsBootLoading).toHaveBeenCalledWith(false));
  expect(deps.reconcileProfile).toHaveBeenCalledTimes(1);
  expect(deps.setUser).not.toHaveBeenCalled();
});
