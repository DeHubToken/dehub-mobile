jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.18.0' }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../../config/env', () => ({
  __esModule: true,
  default: { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'anon' },
}));
jest.mock('../../libs/auth.utils', () => ({ getAuthToken: jest.fn().mockResolvedValue('dehub-token') }));
jest.mock('../../libs/errorReporter', () => ({ reportError: jest.fn() }));
jest.mock('../../libs/token-refresh', () => ({ tokenRefreshManager: { ensureFreshToken: jest.fn().mockResolvedValue(undefined) } }));

const WALLET = '0x' + 'a'.repeat(40);
const REST = 'https://proj.supabase.co/rest/v1/ai_conversations?select=*';

function makeBase(mintBody: unknown, ok = true) {
  return jest.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).includes('/functions/v1/wallet-session')) {
      return { ok, json: async () => mintBody } as unknown as Response;
    }
    return { ok: true } as unknown as Response;
  });
}

const restCalls = (base: jest.Mock) => base.mock.calls.filter(([u]) => String(u).includes('/rest/v1/'));

describe('wallet session fetch', () => {
  beforeEach(() => jest.resetModules());

  it('attaches the minted session and reuses it', async () => {
    const { createWalletSessionFetch } = require('../../libs/wallet-session');
    const base = makeBase({ wallet: WALLET, token: 'signed', expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() });
    const f = createWalletSessionFetch(base);
    await f(REST, { headers: { 'x-wallet-address': WALLET } });
    await f(REST, { headers: { 'x-wallet-address': WALLET } });
    const mints = base.mock.calls.filter(([u]) => String(u).includes('wallet-session'));
    expect(mints).toHaveLength(1);
    expect(JSON.parse(String(mints[0][1]?.body))).toEqual({ client: 'android', appVersion: '1.18.0' });
    for (const [, init] of restCalls(base)) expect(new Headers(init?.headers).get('x-wallet-session')).toBe('signed');
  });

  it('sends the request unsigned when no session can be minted', async () => {
    const { createWalletSessionFetch } = require('../../libs/wallet-session');
    const base = makeBase(null, false);
    const f = createWalletSessionFetch(base);
    await f(REST, { headers: { 'x-wallet-address': WALLET } });
    const [[, init]] = restCalls(base);
    expect(new Headers(init?.headers).get("x-wallet-session")).toBeNull();
  });

  it('leaves requests without a wallet untouched', async () => {
    const { createWalletSessionFetch } = require('../../libs/wallet-session');
    const base = makeBase({});
    const f = createWalletSessionFetch(base);
    await f(REST);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('reports the first unsigned request once, with the server refusal', async () => {
    const { createWalletSessionFetch } = require('../../libs/wallet-session');
    const { reportError } = require('../../libs/errorReporter');
    const base = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/functions/v1/wallet-session')) {
        return { ok: false, status: 403, json: async () => ({ error: 'Token does not belong to the supplied wallet.' }) } as unknown as Response;
      }
      return { ok: true } as unknown as Response;
    });
    const f = createWalletSessionFetch(base);
    await f(REST, { headers: { 'x-wallet-address': WALLET } });
    await f(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith('WalletSession', [
      'Unsigned wallet request (mint_error)',
      expect.objectContaining({
        reason: 'mint_error',
        detail: '403 Token does not belong to the supplied wallet.',
        path: '/rest/v1/ai_conversations',
        client: 'android',
      }),
    ]);
  });

  it('reports a dead DeHub token as no_token', async () => {
    const { createWalletSessionFetch } = require('../../libs/wallet-session');
    const { reportError } = require('../../libs/errorReporter');
    const base = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/functions/v1/wallet-session')) {
        return { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired DeHub token.' }) } as unknown as Response;
      }
      return { ok: true } as unknown as Response;
    });
    await createWalletSessionFetch(base)(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(reportError).toHaveBeenCalledWith('WalletSession', [
      'Unsigned wallet request (no_token)',
      expect.objectContaining({ detail: '401 Invalid or expired DeHub token.' }),
    ]);
  });

  it('reports nothing when the request is signed', async () => {
    const { createWalletSessionFetch } = require('../../libs/wallet-session');
    const { reportError } = require('../../libs/errorReporter');
    const base = makeBase({ wallet: WALLET, token: 'signed', expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() });
    await createWalletSessionFetch(base)(REST, { headers: { 'x-wallet-address': WALLET } });
    expect(reportError).not.toHaveBeenCalled();
  });
});
