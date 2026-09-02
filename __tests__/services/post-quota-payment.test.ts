/**
 * A post-allowance charge that cannot be settled must never be silently lost.
 *
 * The transfer goes out before the server is told, so the two can come apart.
 * The retry ladder handles the common case, but it is finite — and when it ran
 * out the hash was deleted from the stash and the same `false` was returned as
 * for "still queued". The caller could not tell the difference and told the
 * creator their payment was "still confirming" at the exact moment the app had
 * stopped trying, leaving an open charge that blocks their next paid post.
 *
 * These lock the three outcomes apart, and that an abandoned hash survives.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockSettlePostCharge = jest.fn();

// The module pulls the whole web3 stack in at import time; none of it is
// reachable from settleWithRetry, so stub the edges rather than the logic.
jest.mock('../../services/post-quota.service', () => ({
  settlePostCharge: (...args: unknown[]) => mockSettlePostCharge(...args),
}));
jest.mock('../../libs/contract.factory', () => ({ buildContract: jest.fn() }));
jest.mock('../../services/auth/authAdapter', () => ({ createAuthAdapter: jest.fn() }));
jest.mock('../../libs/aa.write', () => ({ writeContractAA: jest.fn() }));
jest.mock('../../services/ethers.service', () => ({ ethersService: { getErc20Balance: jest.fn() } }));
jest.mock('../../libs/auth.utils', () => ({ getAuthMethod: jest.fn() }));

import {
  settleWithRetry,
  readAbandonedSettlements,
} from '../../services/post-quota-payment';

const PENDING_KEY = '@dhb_post_quota_pending_settlements';
const ABANDONED_KEY = '@dhb_post_quota_abandoned_settlements';

beforeEach(async () => {
  mockSettlePostCharge.mockReset();
  await AsyncStorage.removeItem(PENDING_KEY);
  await AsyncStorage.removeItem(ABANDONED_KEY);
});

/** The ladder's real gaps are 0/2.5s/6s; the timing is not what is under test. */
const NO_WAIT = [0, 0, 0];

const pending = async () => JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) || '[]');

describe('settleWithRetry', () => {
  it('reports settled and clears the stash when the server closes the charge', async () => {
    mockSettlePostCharge.mockResolvedValue({ settled: true });

    await expect(settleWithRetry('0xabc', 8453, 0, NO_WAIT)).resolves.toBe('settled');
    expect(await pending()).toEqual([]);
    expect(await readAbandonedSettlements()).toEqual([]);
  });

  it('reports pending and stashes the hash while retries remain', async () => {
    mockSettlePostCharge.mockRejectedValue(new Error('502'));

    await expect(settleWithRetry('0xdef', 8453, 0, NO_WAIT)).resolves.toBe('pending');

    // Still ours to retry, and the attempt count carries forward.
    expect(await pending()).toEqual([{ txHash: '0xdef', chainId: 8453, attempts: 3 }]);
    expect(await readAbandonedSettlements()).toEqual([]);
  });

  it('reports abandoned once the ladder is spent, and keeps the hash', async () => {
    mockSettlePostCharge.mockRejectedValue(new Error('502'));

    // MAX_ATTEMPTS is 12 and each call spends 3, so this is the last one.
    await expect(settleWithRetry('0x999', 56, 9, NO_WAIT)).resolves.toBe('abandoned');

    // Not retried again...
    expect(await pending()).toEqual([]);
    // ...but not lost either: the DHB moved, so the reference has to survive.
    expect(await readAbandonedSettlements()).toEqual([
      { txHash: '0x999', chainId: 56, attempts: 12 },
    ]);
  });

  it('never reports the same value for "still queued" and "given up"', async () => {
    mockSettlePostCharge.mockRejectedValue(new Error('502'));

    const queued = await settleWithRetry('0xaaa', 8453, 0, NO_WAIT);
    const givenUp = await settleWithRetry('0xbbb', 8453, 9, NO_WAIT);

    expect(queued).toBe('pending');
    expect(givenUp).toBe('abandoned');
    expect(queued).not.toBe(givenUp);
  });

  it('does not duplicate an abandoned hash if it comes back round', async () => {
    mockSettlePostCharge.mockRejectedValue(new Error('502'));

    await settleWithRetry('0xccc', 8453, 9, NO_WAIT);
    await settleWithRetry('0xccc', 8453, 9, NO_WAIT);

    const abandoned = await readAbandonedSettlements();
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].txHash).toBe('0xccc');
  });
});
