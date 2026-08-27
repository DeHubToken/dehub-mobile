import { AuthService, WalletNotLinkedError } from '../../services/auth.service';
import { apiClient } from '../../libs/api.client';
import { getOrCreateAuthSignature } from '../../libs/web3.auth.sign';
import { getSupabaseAccessToken } from '../../services/auth/supabaseAuth.service';
import * as SecureStore from 'expo-secure-store';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('../../libs/web3.auth.sign', () => ({
  getOrCreateAuthSignature: jest.fn().mockResolvedValue({ sig: '0xsig', timestamp: 1 }),
  buildAuthRequestPayload: jest.fn((address: string, meta: any) => ({
    address,
    sig: meta.sig,
    timestamp: meta.timestamp,
  })),
}));

jest.mock('../../services/auth/supabaseAuth.service', () => ({
  getSupabaseAccessToken: jest.fn(),
}));

const NEW_ADDRESS = '0x4444444444444444444444444444444444444444';

const mockApiPost = apiClient.post as jest.Mock;
const mockApiGet = apiClient.get as jest.Mock;
const mockGetOrCreateAuthSignature = getOrCreateAuthSignature as jest.Mock;
const mockGetSupabaseAccessToken = getSupabaseAccessToken as jest.Mock;
const mockStore = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Record<string, string>;
  __clear: () => void;
};

describe('services/auth.service', () => {
  beforeEach(() => {
    mockStore.__clear();
    jest.clearAllMocks();
  });

  describe('checkUsernameAvailability', () => {
    it('rejects empty username', async () => {
      const result = await AuthService.checkUsernameAvailability('');
      expect(result.available).toBe(false);
      expect(result.message).toBe('Username required');
    });

    it('rejects short username', async () => {
      const result = await AuthService.checkUsernameAvailability('ab');
      expect(result.available).toBe(false);
      expect(result.message).toBe('3-30 chars required');
    });

    it('rejects username over 30 chars', async () => {
      const result = await AuthService.checkUsernameAvailability('a'.repeat(31));
      expect(result.available).toBe(false);
      expect(result.message).toBe('3-30 chars required');
    });

    it('rejects invalid characters', async () => {
      const result = await AuthService.checkUsernameAvailability('user name!');
      expect(result.available).toBe(false);
      expect(result.message).toBe('Only letters, numbers, _');
    });

    it('returns available for valid username', async () => {
      mockApiGet.mockResolvedValueOnce({
        status: true,
        available: true,
      });

      const result = await AuthService.checkUsernameAvailability('alice_123');
      expect(result.available).toBe(true);
      expect(result.message).toBe('Available');
    });

    it('returns taken for unavailable username', async () => {
      mockApiGet.mockResolvedValueOnce({
        status: true,
        available: false,
      });

      const result = await AuthService.checkUsernameAvailability('taken_user');
      expect(result.available).toBe(false);
      expect(result.message).toBe('Taken');
    });

    it('handles API error gracefully', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Network error'));
      const result = await AuthService.checkUsernameAvailability('someuser');
      expect(result.available).toBe(false);
      expect(result.message).toBe('Lookup failed');
    });
  });

  describe('signOut', () => {
    it('calls logout API and clears auth data', async () => {
      mockStore.__store['auth_refresh_token'] = 'refresh-tok';
      mockStore.__store['auth_token'] = 'access-tok';
      mockApiPost.mockResolvedValueOnce(undefined);

      await AuthService.signOut();

      expect(mockApiPost).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'refresh-tok' });
      expect(await SecureStore.getItemAsync('auth_token')).toBeNull();
    });

    it('still clears auth data if logout API fails', async () => {
      mockStore.__store['auth_refresh_token'] = 'refresh-tok';
      mockStore.__store['auth_token'] = 'access-tok';
      mockApiPost.mockRejectedValueOnce(new Error('Network error'));

      await AuthService.signOut();
      expect(await SecureStore.getItemAsync('auth_token')).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('fetches current user from API', async () => {
      const mockUser = { _id: '1', address: '0xabc', username: 'alice' };
      mockApiGet.mockResolvedValueOnce(mockUser);

      const user = await AuthService.getCurrentUser();
      expect(user).toEqual(mockUser);
      expect(mockApiGet).toHaveBeenCalledWith('/auth/me');
    });
  });

  describe('logoutAllDevices', () => {
    it('calls logout-all and clears auth', async () => {
      mockStore.__store['auth_token'] = 'tok';
      mockApiPost.mockResolvedValueOnce(undefined);

      await AuthService.logoutAllDevices();

      expect(mockApiPost).toHaveBeenCalledWith('/auth/logout-all', {});
      expect(await SecureStore.getItemAsync('auth_token')).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('sends FormData and returns partial user', async () => {
      const data = { username: 'newname', bio: 'hello' };
      mockApiPost.mockResolvedValueOnce({ success: true });

      const result = await AuthService.updateProfile(data);
      expect(result).toEqual(data);

      const [endpoint, body] = mockApiPost.mock.calls[0];
      expect(endpoint).toBe('/update_profile');
      expect(body).toBeInstanceOf(FormData);
    });

    it('throws when API returns error', async () => {
      mockApiPost.mockResolvedValueOnce({ error: true, error_msg: 'Username taken' });
      await expect(AuthService.updateProfile({ username: 'taken' })).rejects.toThrow('Username taken');
    });
  });

  describe('rotateWallet', () => {
    it('refuses without a social session — there is no account to identify', async () => {
      mockGetSupabaseAccessToken.mockResolvedValueOnce(null);
      await expect(AuthService.rotateWallet(NEW_ADDRESS, 8453)).rejects.toBeInstanceOf(
        WalletNotLinkedError,
      );
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it('sends the new address, its signature and the Supabase token', async () => {
      mockGetSupabaseAccessToken.mockResolvedValueOnce('supabase-jwt');
      mockApiPost.mockResolvedValueOnce({ status: true });

      await AuthService.rotateWallet(NEW_ADDRESS, 8453);

      const [endpoint, body, opts] = mockApiPost.mock.calls[0];
      expect(endpoint).toBe('/auth/rotate-wallet');
      expect(body.supabaseAccessToken).toBe('supabase-jwt');
      expect(body.chainId).toBe(8453);
      // The signature proves control of the DESTINATION. Without it a Supabase
      // session alone could push the account onto somebody else's wallet.
      expect(mockGetOrCreateAuthSignature).toHaveBeenCalledWith(NEW_ADDRESS, undefined, 8453);
      // No DeHub token yet: the account has not moved when this is sent.
      expect(opts).toEqual({ isAuthRequired: false });
    });

    it('reports an unlinked or ambiguous identity as recoverable', async () => {
      // The caller falls back to signing in as a new account rather than
      // stranding the user, so these must be distinguishable from a real fault.
      for (const code of ['WALLET_NOT_LINKED', 'WALLET_LINK_AMBIGUOUS']) {
        mockGetSupabaseAccessToken.mockResolvedValueOnce('supabase-jwt');
        mockApiPost.mockRejectedValueOnce({ code });
        await expect(AuthService.rotateWallet(NEW_ADDRESS, 8453)).rejects.toBeInstanceOf(
          WalletNotLinkedError,
        );
      }
    });

    it('lets a real fault through untranslated', async () => {
      mockGetSupabaseAccessToken.mockResolvedValueOnce('supabase-jwt');
      mockApiPost.mockRejectedValueOnce({ code: 'ADDRESS_IN_USE', message: 'taken' });
      await expect(AuthService.rotateWallet(NEW_ADDRESS, 8453)).rejects.toMatchObject({
        code: 'ADDRESS_IN_USE',
      });
    });
  });
});
