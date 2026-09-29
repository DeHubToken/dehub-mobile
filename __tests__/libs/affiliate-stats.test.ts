import { loadAffiliateStats } from '../../libs/affiliate';

type Result = { data: unknown; error: unknown; count?: number | null };

const OFFLINE = { message: 'TypeError: Network request failed', code: '' };

let mockResults: {
  codes: Result;
  insert: Result;
  referrals: Result;
  earnings: Result;
  rpc: Result;
};

// A postgrest builder: every call chains, and awaiting it resolves (never
// rejects) with whatever the test put in `mockResults` for that table.
function mockBuilder(table: string) {
  let inserting = false;
  const b: any = {};
  for (const m of ['select', 'ilike', 'eq', 'order', 'limit', 'maybeSingle', 'update']) {
    b[m] = jest.fn(() => b);
  }
  b.insert = jest.fn(() => {
    inserting = true;
    return b;
  });
  b.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => {
    const res =
      table === 'affiliate_codes'
        ? inserting
          ? mockResults.insert
          : mockResults.codes
        : table === 'affiliate_referrals'
          ? mockResults.referrals
          : mockResults.earnings;
    return Promise.resolve(res).then(resolve, reject);
  };
  return b;
}

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockBuilder(table),
    rpc: () => ({
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(mockResults.rpc).then(resolve, reject),
    }),
  },
}));
jest.mock('../../config/env', () => ({
  __esModule: true,
  default: { APP_ORIGIN: 'https://dehub.io', SUPABASE_URL: 'https://db.test' },
}));
jest.mock('../../libs/misc', () => ({ shareProfile: jest.fn() }));

const WALLET = '0x1111111111111111111111111111111111111111';

describe('loadAffiliateStats', () => {
  it('throws when there is no code and the stats queries failed, instead of returning zeros', async () => {
    mockResults = {
      codes: { data: null, error: OFFLINE },
      insert: { data: null, error: OFFLINE },
      referrals: { data: null, error: OFFLINE, count: null },
      earnings: { data: null, error: OFFLINE },
      rpc: { data: null, error: OFFLINE },
    };

    await expect(loadAffiliateStats(WALLET)).rejects.toThrow('affiliate stats unavailable');
  });

  it('still resolves for a new account whose code could not be created but whose queries worked', async () => {
    mockResults = {
      codes: { data: [], error: null },
      insert: { data: null, error: { message: 'duplicate key' } },
      referrals: { data: [], error: null, count: 0 },
      earnings: { data: [], error: null },
      rpc: { data: [], error: null },
    };

    const stats = await loadAffiliateStats(WALLET);
    expect(stats.code).toBeNull();
    expect(stats.referrals).toBe(0);
    expect(stats.totalViews).toBe(0);
  });

  it('keeps the code when only a stats query failed', async () => {
    mockResults = {
      codes: { data: [{ code: 'ABCD2345', share_name: null }], error: null },
      insert: { data: null, error: null },
      referrals: { data: null, error: OFFLINE, count: null },
      earnings: { data: null, error: OFFLINE },
      rpc: { data: null, error: OFFLINE },
    };

    const stats = await loadAffiliateStats(WALLET);
    expect(stats.code).toBe('ABCD2345');
  });
});
