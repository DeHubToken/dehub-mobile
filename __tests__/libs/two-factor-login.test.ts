import { apiClient } from '../../libs/api.client';
import { getTwoFactorPrompt } from '../../libs/two-factor-login';
import * as SecureStore from 'expo-secure-store';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore> & { __clear: () => void };
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('../../libs/token-refresh', () => ({
  tokenRefreshManager: {
    ensureFreshToken: jest.fn().mockResolvedValue(undefined),
    attemptRefresh: jest.fn().mockResolvedValue(null),
    invalidateSession: jest.fn(),
  },
}));

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

const waitForPrompt = async () => {
  for (let i = 0; i < 50 && !getTwoFactorPrompt(); i++) await new Promise((r) => setTimeout(r, 0));
  return getTwoFactorPrompt()!;
};

describe('two-step sign-in', () => {
  beforeEach(() => {
    mockStore.__clear();
    mockFetch.mockReset();
  });

  it('pauses the login for the code and returns the session the code unlocked', async () => {
    mockFetch
      .mockResolvedValueOnce(json(403, { code: 'TWO_FACTOR_REQUIRED', challenge: 'ch1', account: { username: 'mal' } }))
      .mockResolvedValueOnce(json(401, { code: 'TWO_FACTOR_WRONG_CODE', message: 'That code didn’t match.' }))
      .mockResolvedValueOnce(json(201, { token: 't', twoFactorTrust: 'trust1' }));

    const login = apiClient.post('/mobile/auth', { sig: 'proof' }, { isAuthRequired: false, retrySession: true });
    const prompt = await waitForPrompt();
    expect(prompt.account.username).toBe('mal');

    await expect(prompt.submit({ code: '000000', trustDevice: true })).rejects.toThrow('That code didn’t match.');
    expect(getTwoFactorPrompt()).toBe(prompt);
    await prompt.submit({ code: '123456', trustDevice: true });

    await expect(login).resolves.toEqual({ token: 't', twoFactorTrust: 'trust1' });
    expect(getTwoFactorPrompt()).toBeNull();
    expect(mockFetch.mock.calls[2][0]).toBe('https://api.dehub.io/api/auth/2fa/verify');
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({ challenge: 'ch1', code: '123456', trustDevice: true });

    // The trusted-device token rides along on the next login.
    mockFetch.mockReset().mockResolvedValueOnce(json(201, { token: 't2' }));
    await apiClient.post('/mobile/auth', { sig: 'proof' }, { isAuthRequired: false });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).twoFactorTrust).toEqual(['trust1']);
  });

  it('closing the code step ends the login as a user cancel', async () => {
    mockFetch.mockResolvedValueOnce(json(403, { code: 'TWO_FACTOR_REQUIRED', challenge: 'ch2' }));
    const login = apiClient.post('/web/auth/supabase', {}, { isAuthRequired: false, quiet: true });
    (await waitForPrompt()).cancel();
    await expect(login).rejects.toMatchObject({ code: 'ACTION_REJECTED' });
    expect(getTwoFactorPrompt()).toBeNull();
  });

  it('leaves other refusals alone', async () => {
    mockFetch.mockResolvedValueOnce(json(409, { code: 'WALLET_NOT_LINKED', message: 'not linked' }));
    await expect(apiClient.post('/web/auth/supabase', {}, { isAuthRequired: false, quiet: true })).rejects.toMatchObject({ code: 'WALLET_NOT_LINKED' });
    expect(getTwoFactorPrompt()).toBeNull();
  });
});
