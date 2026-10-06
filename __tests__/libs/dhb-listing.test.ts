/**
 * $DHB has no market yet, so the ticker sheet swaps its price lookup for the
 * listing-soon signup. These pin which symbols get that panel and which emails
 * the signup accepts.
 */

const mockRpc = jest.fn();
const mockGetAuthMeta = jest.fn();

jest.mock('../../services/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('../../services/auth/supabaseAuth.service', () => ({
  getSupabaseAuthMeta: () => mockGetAuthMeta(),
}));

import {
  getSignInEmail,
  isDhbListingSymbol,
  isValidListingEmail,
  joinDhbListingWaitlist,
} from '../../libs/dhb-listing';

afterEach(() => {
  mockRpc.mockReset();
  mockGetAuthMeta.mockReset();
});

describe('isDhbListingSymbol', () => {
  it('matches DHB and DEHUB with or without the cashtag', () => {
    expect(isDhbListingSymbol('$DHB')).toBe(true);
    expect(isDhbListingSymbol('dhb')).toBe(true);
    expect(isDhbListingSymbol('$DEHUB')).toBe(true);
  });

  it('leaves every other ticker on the price sheet', () => {
    expect(isDhbListingSymbol('$BTC')).toBe(false);
    expect(isDhbListingSymbol('DHBX')).toBe(false);
    expect(isDhbListingSymbol('')).toBe(false);
  });
});

describe('isValidListingEmail', () => {
  it('accepts real addresses and rejects junk and synthetic ones', () => {
    expect(isValidListingEmail('a@b.co')).toBe(true);
    expect(isValidListingEmail(' Mal@Example.com ')).toBe(true);
    expect(isValidListingEmail('not-an-email')).toBe(false);
    expect(isValidListingEmail('123@phone.dehub.internal')).toBe(false);
  });
});

describe('getSignInEmail', () => {
  it('returns the sign-in address when it is a real one', async () => {
    mockGetAuthMeta.mockResolvedValue({ email: 'mal@example.com' });
    await expect(getSignInEmail()).resolves.toBe('mal@example.com');
  });

  it('returns null for wallet-only and signed-out accounts', async () => {
    mockGetAuthMeta.mockResolvedValue({ email: undefined });
    await expect(getSignInEmail()).resolves.toBeNull();
    mockGetAuthMeta.mockResolvedValue(undefined);
    await expect(getSignInEmail()).resolves.toBeNull();
  });
});

describe('joinDhbListingWaitlist', () => {
  it('sends the signup to the shared waitlist RPC', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, alreadyJoined: false }, error: null });
    await expect(
      joinDhbListingWaitlist({ email: ' fan@example.com ', walletAddress: '0xabc', username: 'fan' }),
    ).resolves.toEqual({ alreadyJoined: false });
    expect(mockRpc).toHaveBeenCalledWith('join_token_listing_waitlist', {
      p_token: 'DHB',
      p_email: 'fan@example.com',
      p_wallet_address: '0xabc',
      p_username: 'fan',
      p_source: 'mobile',
    });
  });

  it('throws when the RPC refuses, so the sheet can say so', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid email' } });
    await expect(joinDhbListingWaitlist({ email: 'x@y.co' })).rejects.toEqual({ message: 'invalid email' });
  });
});
