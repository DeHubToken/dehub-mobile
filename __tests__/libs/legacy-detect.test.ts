/**
 * checkLegacyAccount gates whether a brand-new identity is offered its
 * pre-migration account before a wallet is minted for it. Getting that wrong
 * in either direction is expensive: skipping the check orphans a real account
 * behind an empty one, and running it needlessly puts an edge-function cold
 * start directly between "confirm code" and the wallet screen.
 *
 * These pin both the skip condition and the memo, because both decide whether
 * a network call happens at all.
 */

const mockInvoke = jest.fn();
const mockGetSession = jest.fn();

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const session = (user: { id: string; email?: string }) => ({
  data: { session: { user } },
});

type CheckLegacyAccount =
  typeof import('../../libs/wallet-core/legacy-detect').checkLegacyAccount;

/** Re-require per test so the module-level memo starts empty each time. */
function freshCheckLegacyAccount(): CheckLegacyAccount {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../libs/wallet-core/legacy-detect').checkLegacyAccount;
}

describe('checkLegacyAccount', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockGetSession.mockReset();
  });

  it('does not call the edge function for a phone sign-up', async () => {
    mockGetSession.mockResolvedValue(
      session({ id: 'user-1', email: '+15551234567@phone.dehub.internal' }),
    );
    const checkLegacyAccount = freshCheckLegacyAccount();

    await expect(checkLegacyAccount()).resolves.toEqual({ exists: false, accounts: [] });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('still asks when the session has no email at all (unknown, not "none")', async () => {
    mockGetSession.mockResolvedValue(session({ id: 'user-2' }));
    mockInvoke.mockResolvedValue({ data: { exists: false, accounts: [] }, error: null });
    const checkLegacyAccount = freshCheckLegacyAccount();

    await checkLegacyAccount();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('invokes once for two calls in the same sign-in', async () => {
    mockGetSession.mockResolvedValue(session({ id: 'user-3', email: 'real@example.com' }));
    mockInvoke.mockResolvedValue({
      data: { exists: true, accounts: [{ ethAddress: '0xabc' }], email: 'real@example.com' },
      error: null,
    });
    const checkLegacyAccount = freshCheckLegacyAccount();

    const first = await checkLegacyAccount();
    const second = await checkLegacyAccount();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.accounts).toEqual([{ ethAddress: '0xabc' }]);
  });

  it('re-asks when a different identity signs in', async () => {
    mockInvoke.mockResolvedValue({ data: { exists: false, accounts: [] }, error: null });
    const checkLegacyAccount = freshCheckLegacyAccount();

    mockGetSession.mockResolvedValue(session({ id: 'user-a', email: 'a@example.com' }));
    await checkLegacyAccount();
    mockGetSession.mockResolvedValue(session({ id: 'user-b', email: 'b@example.com' }));
    await checkLegacyAccount();

    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('does not memoize an unavailable check', async () => {
    mockGetSession.mockResolvedValue(session({ id: 'user-4', email: 'real@example.com' }));
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const checkLegacyAccount = freshCheckLegacyAccount();

    await expect(checkLegacyAccount()).resolves.toEqual({ exists: null });

    mockInvoke.mockResolvedValueOnce({
      data: { exists: true, accounts: [{ ethAddress: '0xdef' }] },
      error: null,
    });
    await expect(checkLegacyAccount()).resolves.toMatchObject({ exists: true });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
