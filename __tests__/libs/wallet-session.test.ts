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
});
