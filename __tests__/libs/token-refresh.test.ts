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
    it('notifies the UI after a rejected session has been cleared', async () => {
      await setAuthToken('old-access');
      await setRefreshToken('old-refresh');
      const seenTokens: (string | null)[] = [];
      const listener = jest.fn(() => { seenTokens.push(mockStore.__store.auth_token ?? null); });
      const unsubscribe = tokenRefreshManager.onSessionInvalidated(listener);
      try {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 401,
          json: async () => ({ message: 'Invalid refresh token' }) });
        await tokenRefreshManager.attemptRefresh();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(seenTokens).toEqual([null]);
        expect(await getRefreshToken()).toBeNull();
      } finally { unsubscribe(); }
    });

    it('invalidates a cached account with no usable refresh token', async () => {
      await setAuthToken('expired-access');
      const listener = jest.fn();
      const unsubscribe = tokenRefreshManager.onSessionInvalidated(listener);
      try {
        await tokenRefreshManager.attemptRefresh();
        expect(await getAuthToken()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(mockFetch).not.toHaveBeenCalled();
      } finally { unsubscribe(); }
    });

    it.each([500, 429, undefined])('preserves the session on a transient failure (%s)', async (status) => {
      await setAuthToken('old-access');
      await setRefreshToken('old-refresh');
      const listener = jest.fn();
      const unsubscribe = tokenRefreshManager.onSessionInvalidated(listener);
      try {
        if (status) mockFetch.mockResolvedValueOnce({ ok: false, status,
          json: async () => ({ message: 'Try again' }) });
        else mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
        await tokenRefreshManager.attemptRefresh();
        expect(await getAuthToken()).toBe('old-access');
        expect(await getRefreshToken()).toBe('old-refresh');
        expect(listener).not.toHaveBeenCalled();
      } finally { unsubscribe(); }
    });

    it('does not sign out a newer login when an older refresh is rejected', async () => {
      await setAuthToken('old-access');
      await setRefreshToken('old-refresh');
      const listener = jest.fn();
      const unsubscribe = tokenRefreshManager.onSessionInvalidated(listener);
      let answer: (value: any) => void = () => {};
      let issued: () => void = () => {};
      const requestIssued = new Promise<void>(resolve => { issued = resolve; });
      mockFetch.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; issued(); }));
      try {
        const pending = tokenRefreshManager.attemptRefresh();
        await requestIssued;
        await setAuthToken('new-login');
        await setRefreshToken('new-refresh');
        answer({ ok: false, status: 401, json: async () => ({ message: 'Revoked' }) });
        await pending;
        expect(await getAuthToken()).toBe('new-login');
        expect(await getRefreshToken()).toBe('new-refresh');
        expect(listener).not.toHaveBeenCalled();
      } finally { unsubscribe(); }
    });

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

    it('aborts a refresh that never answers, instead of hanging forever', async () => {
      await setRefreshToken('refresh-tok');
      await setAuthToken('old-token');

      // A socket the phone lost without closing: fetch settles only when the
      // abort signal fires. Before the timeout, this pended forever and took
      // every authenticated call in the app down with it.
      let requestIssued: () => void;
      const issued = new Promise<void>((resolve) => { requestIssued = resolve; });
      mockFetch.mockImplementationOnce(
        (_url: string, init: any) =>
          new Promise((_resolve, reject) => {
            requestIssued();
            init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      );

      jest.useFakeTimers();
      const pending = tokenRefreshManager.attemptRefresh();
      // The storage reads ahead of the request are promises, not timers, so
      // they settle on their own — wait for the request itself before winding
      // the clock, or the timeout being tested does not exist yet.
      await issued;
      jest.advanceTimersByTime(20_000);

      await expect(pending).resolves.toBeNull();
      jest.useRealTimers();
      // A timeout is not proof the session is dead, so credentials survive it.
      expect(await getRefreshToken()).toBe('refresh-tok');
      expect(await getAuthToken()).toBe('old-token');
    });

    it('does not strand callers behind a refresh that died', async () => {
      await setRefreshToken('refresh-tok');

      // Never settles and never aborts — the flag is left up for good.
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));
      void tokenRefreshManager.attemptRefresh();

      const realNow = Date.now;
      // Past the point where an in-flight refresh could still be honest.
      Date.now = () => realNow() + 60_000;
      try {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                accessToken: 'recovered-token',
                refreshToken: 'recovered-refresh',
                expiresIn: 3600,
              }),
          }),
        );
        await expect(tokenRefreshManager.attemptRefresh()).resolves.toBe('recovered-token');
      } finally {
        Date.now = realNow;
      }
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
