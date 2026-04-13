import * as SecureStore from 'expo-secure-store';
import {
  getAuthToken, setAuthToken, removeAuthToken,
  getRefreshToken, setRefreshToken, removeRefreshToken,
  getTokenExpiresAt, setTokenExpiresAt,
  getAuthUser, setAuthUser, removeAuthUser,
  hasSeenAuth, setHasSeenAuth,
  hasSeenOnboarding, setHasSeenOnboarding,
  clearAuthData, createAuthHeaders, isTokenExpired,
  setAuthMethod, getAuthMethod, clearAuthMethod,
  setPreferredChainId, getPreferredChainId,
  AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY, AUTH_USER_KEY,
} from '../../libs/auth.utils';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Record<string, string>;
  __clear: () => void;
};

describe('libs/auth.utils', () => {
  beforeEach(() => {
    mockStore.__clear();
    jest.clearAllMocks();
  });

  describe('token operations', () => {
    it('getAuthToken returns null when empty', async () => {
      expect(await getAuthToken()).toBeNull();
    });

    it('setAuthToken + getAuthToken round-trips', async () => {
      await setAuthToken('test-token');
      expect(await getAuthToken()).toBe('test-token');
    });

    it('removeAuthToken clears the token', async () => {
      await setAuthToken('test-token');
      await removeAuthToken();
      expect(await getAuthToken()).toBeNull();
    });
  });

  describe('refresh token operations', () => {
    it('round-trips refresh token', async () => {
      await setRefreshToken('refresh-123');
      expect(await getRefreshToken()).toBe('refresh-123');
    });

    it('removeRefreshToken clears it', async () => {
      await setRefreshToken('refresh-123');
      await removeRefreshToken();
      expect(await getRefreshToken()).toBeNull();
    });
  });

  describe('token expiry', () => {
    it('round-trips expires at timestamp', async () => {
      const ts = Date.now() + 3600000;
      await setTokenExpiresAt(ts);
      expect(await getTokenExpiresAt()).toBe(ts);
    });

    it('returns null when not set', async () => {
      expect(await getTokenExpiresAt()).toBeNull();
    });
  });

  describe('auth user', () => {
    it('returns null when not set', async () => {
      expect(await getAuthUser()).toBeNull();
    });

    it('stores only essential fields', async () => {
      const user = {
        _id: '123', address: '0xabc', username: 'alice',
        displayName: 'Alice', bio: 'hello',
        someExtraField: 'should be stripped',
        avatarImageUrl: 'avatar.jpg',
      };
      await setAuthUser(user);
      const stored = await getAuthUser();
      expect(stored).toHaveProperty('_id', '123');
      expect(stored).toHaveProperty('username', 'alice');
      expect(stored).not.toHaveProperty('someExtraField');
    });

    it('removeAuthUser clears it', async () => {
      await setAuthUser({ _id: '1', address: '0x1' });
      await removeAuthUser();
      expect(await getAuthUser()).toBeNull();
    });
  });

  describe('onboarding flags', () => {
    it('hasSeenAuth defaults to false', async () => {
      expect(await hasSeenAuth()).toBe(false);
    });

    it('setHasSeenAuth sets flag', async () => {
      await setHasSeenAuth();
      expect(await hasSeenAuth()).toBe(true);
    });

    it('hasSeenOnboarding defaults to false', async () => {
      expect(await hasSeenOnboarding()).toBe(false);
    });

    it('setHasSeenOnboarding sets flag', async () => {
      await setHasSeenOnboarding();
      expect(await hasSeenOnboarding()).toBe(true);
    });
  });

  describe('clearAuthData', () => {
    it('clears all auth-related keys', async () => {
      await setAuthToken('tok');
      await setRefreshToken('ref');
      await setTokenExpiresAt(12345);
      await setAuthUser({ _id: '1', address: '0x1' });

      await clearAuthData();

      expect(await getAuthToken()).toBeNull();
      expect(await getRefreshToken()).toBeNull();
      expect(await getTokenExpiresAt()).toBeNull();
      expect(await getAuthUser()).toBeNull();
    });
  });

  describe('createAuthHeaders', () => {
    it('returns Authorization header when token exists', async () => {
      await setAuthToken('bearer-token');
      const headers = await createAuthHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer bearer-token' });
    });

    it('returns empty object when no token', async () => {
      const headers = await createAuthHeaders();
      expect(headers).toEqual({});
    });
  });

  describe('isTokenExpired', () => {
    it('returns true for empty token', () => {
      expect(isTokenExpired('')).toBe(true);
    });

    it('returns true for malformed JWT', () => {
      expect(isTokenExpired('not.a.jwt')).toBe(true);
    });

    it('returns true for expired token', () => {
      // JWT with exp = 0 (1970)
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ exp: 0 }));
      const token = `${header}.${payload}.signature`;
      expect(isTokenExpired(token)).toBe(true);
    });

    it('returns false for token expiring in the future', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const payload = btoa(JSON.stringify({ exp: futureExp }));
      const token = `${header}.${payload}.signature`;
      expect(isTokenExpired(token)).toBe(false);
    });
  });

  describe('auth method', () => {
    it('defaults to null', async () => {
      const { method, address } = await getAuthMethod();
      expect(method).toBeNull();
      expect(address).toBeNull();
    });

    it('stores and retrieves auth method', async () => {
      await setAuthMethod('web3auth', '0xABC');
      const { method, address } = await getAuthMethod();
      expect(method).toBe('web3auth');
      expect(address).toBe('0xabc'); // lowercased
    });

    it('clearAuthMethod resets', async () => {
      await setAuthMethod('local');
      await clearAuthMethod();
      const { method } = await getAuthMethod();
      expect(method).toBeNull();
    });
  });

  describe('preferred chain id', () => {
    it('defaults to null', async () => {
      expect(await getPreferredChainId()).toBeNull();
    });

    it('stores and retrieves chain id', async () => {
      await setPreferredChainId(137);
      expect(await getPreferredChainId()).toBe(137);
    });
  });
});
