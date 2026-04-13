import * as SecureStore from 'expo-secure-store';
import { tokenRefreshManager } from '../../libs/token-refresh';
import {
  setRefreshToken, setTokenExpiresAt, setAuthToken,
  getAuthToken, getRefreshToken,
} from '../../libs/auth.utils';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Record<string, string>;
  __clear: () => void;
};

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('libs/token-refresh', () => {
  beforeEach(() => {
    mockStore.__clear();
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  describe('attemptRefresh', () => {
    it('returns null when no refresh token stored', async () => {
      const result = await tokenRefreshManager.attemptRefresh();
      expect(result).toBeNull();
    });

    it('refreshes token and stores new tokens', async () => {
      await setRefreshToken('old-refresh');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
        }),
      });

      const result = await tokenRefreshManager.attemptRefresh();
      expect(result).toBe('new-access');
      expect(await getAuthToken()).toBe('new-access');
      expect(await getRefreshToken()).toBe('new-refresh');
    });

    it('clears auth data on refresh failure', async () => {
      await setRefreshToken('old-refresh');
      await setAuthToken('old-access');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid refresh token' }),
      });

      const result = await tokenRefreshManager.attemptRefresh();
      expect(result).toBeNull();
      expect(await getAuthToken()).toBeNull();
    });

    it('coalesces concurrent refresh calls', async () => {
      await setRefreshToken('refresh-tok');

      let resolveRefresh: (value: any) => void;
      const refreshPromise = new Promise((resolve) => { resolveRefresh = resolve; });

      mockFetch.mockImplementationOnce(() => {
        return refreshPromise;
      });

      // Fire multiple concurrent refreshes
      const p1 = tokenRefreshManager.attemptRefresh();
      const p2 = tokenRefreshManager.attemptRefresh();
      const p3 = tokenRefreshManager.attemptRefresh();

      // Resolve the single fetch
      resolveRefresh!({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'coalesced-token',
          refreshToken: 'coalesced-refresh',
          expiresIn: 3600,
        }),
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe('coalesced-token');
      expect(r2).toBe('coalesced-token');
      expect(r3).toBe('coalesced-token');

      // Only one fetch call was made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureFreshToken', () => {
    it('does nothing when no expiry is set', async () => {
      await tokenRefreshManager.ensureFreshToken();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does nothing when token expires far in the future', async () => {
      await setTokenExpiresAt(Date.now() + 300_000); // 5 min in future
      await tokenRefreshManager.ensureFreshToken();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('triggers refresh when token expires within buffer', async () => {
      await setRefreshToken('refresh-tok');
      await setTokenExpiresAt(Date.now() + 30_000); // 30s in future, within 60s buffer

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'proactive-token',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
        }),
      });

      await tokenRefreshManager.ensureFreshToken();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(await getAuthToken()).toBe('proactive-token');
    });
  });

  describe('onTokenRefreshed', () => {
    it('notifies listeners after successful refresh', async () => {
      const listener = jest.fn();
      const unsub = tokenRefreshManager.onTokenRefreshed(listener);

      await setRefreshToken('refresh-tok');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'new',
          refreshToken: 'new-ref',
          expiresIn: 3600,
        }),
      });

      await tokenRefreshManager.attemptRefresh();
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accessToken: 'new2',
          refreshToken: 'new-ref2',
          expiresIn: 3600,
        }),
      });

      await setRefreshToken('refresh-tok-2');
      await tokenRefreshManager.attemptRefresh();
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });
  });
});
