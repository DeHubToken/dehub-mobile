import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuthBoot } from '../../hooks/useAuthBoot';
import { isTokenExpired, getRefreshToken } from '../../libs/auth.utils';
import { tokenRefreshManager } from '../../libs/token-refresh';
jest.mock('../../libs/auth.utils', () => ({ isTokenExpired: jest.fn(() => false), getRefreshToken: jest.fn() }));
jest.mock('../../libs/token-refresh', () => ({ tokenRefreshManager: { attemptRefresh: jest.fn() } }));

const makeDeps = (overrides: Record<string, any> = {}) => ({
  getAuthUser: jest.fn().mockResolvedValue({ username: 'kolomba' }),
  getAuthToken: jest.fn().mockResolvedValue('old-token'),
  hasSeenAuth: jest.fn().mockResolvedValue(true),
  setUser: jest.fn(),
  setIsSignedIn: jest.fn(),
  setIsFirstTimeUser: jest.fn(),
  setIsBootLoading: jest.fn(),
  ensureProvider: jest.fn().mockResolvedValue(undefined),
  reconcileProfile: jest.fn().mockResolvedValue(false),
  holdRestoredRefetch: jest.fn(),
  refetchRestoredUser: jest.fn().mockResolvedValue(undefined),
  log: { warn: jest.fn(), error: jest.fn() },
  ...overrides,
});

beforeEach(() => {
  (isTokenExpired as jest.Mock).mockReturnValue(false);
  (getRefreshToken as jest.Mock).mockResolvedValue('refresh');
  (tokenRefreshManager.attemptRefresh as jest.Mock).mockReset();
});

it('does not overwrite a corrected profile with the old owner profile on boot', async () => {
  const deps = makeDeps({ reconcileProfile: jest.fn().mockResolvedValue(true) });
  renderHook(() => useAuthBoot(deps));
  await waitFor(() => expect(deps.reconcileProfile).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 0));
  // The cached profile paints once, before the reconcile; nothing after it
  // puts the old owner profile back.
  expect(deps.setUser).toHaveBeenCalledTimes(1);
  expect(deps.setUser.mock.invocationCallOrder[0]).toBeLessThan(deps.reconcileProfile.mock.invocationCallOrder[0]);
  expect(deps.holdRestoredRefetch).toHaveBeenCalled();
  expect(deps.refetchRestoredUser).not.toHaveBeenCalled();
  expect(deps.ensureProvider).not.toHaveBeenCalled();
});

it('lifts boot before the background reconcile settles', async () => {
  let finish: (v: boolean) => void = () => {};
  const deps = makeDeps({ reconcileProfile: jest.fn(() => new Promise<boolean>((r) => { finish = r; })) });
  renderHook(() => useAuthBoot(deps));
  await waitFor(() => expect(deps.setIsBootLoading).toHaveBeenCalledWith(false));
  expect(deps.setIsSignedIn).toHaveBeenCalledWith(true);
  expect(deps.ensureProvider).not.toHaveBeenCalled();
  finish(false);
  await waitFor(() => expect(deps.ensureProvider).toHaveBeenCalled());
  expect(deps.refetchRestoredUser).toHaveBeenCalledWith({ username: 'kolomba' });
});

it('keeps the cached session when an expired token cannot be refreshed over the network', async () => {
  (isTokenExpired as jest.Mock).mockReturnValue(true);
  (tokenRefreshManager.attemptRefresh as jest.Mock).mockResolvedValue(null);
  (getRefreshToken as jest.Mock).mockResolvedValue('still-here');
  const deps = makeDeps();
  renderHook(() => useAuthBoot(deps));
  await waitFor(() => expect(deps.ensureProvider).toHaveBeenCalled());
  expect(deps.setIsSignedIn).not.toHaveBeenCalledWith(false);
});

it('signs out when the refresh token is definitively rejected', async () => {
  (isTokenExpired as jest.Mock).mockReturnValue(true);
  (tokenRefreshManager.attemptRefresh as jest.Mock).mockResolvedValue(null);
  (getRefreshToken as jest.Mock).mockResolvedValue(null);
  const deps = makeDeps();
  renderHook(() => useAuthBoot(deps));
  await waitFor(() => expect(deps.setIsSignedIn).toHaveBeenCalledWith(false));
  expect(deps.setUser).toHaveBeenLastCalledWith(null);
  expect(deps.ensureProvider).not.toHaveBeenCalled();
  expect(deps.refetchRestoredUser).not.toHaveBeenCalled();
});

it('leaves a user with no saved session signed out', async () => {
  const deps = makeDeps({ getAuthUser: jest.fn().mockResolvedValue(null), getAuthToken: jest.fn().mockResolvedValue(null) });
  renderHook(() => useAuthBoot(deps));
  await waitFor(() => expect(deps.setIsBootLoading).toHaveBeenCalledWith(false));
  expect(deps.setUser).not.toHaveBeenCalled();
  expect(deps.setIsSignedIn).not.toHaveBeenCalled();
  expect(deps.reconcileProfile).not.toHaveBeenCalled();
});
