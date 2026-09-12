
import { classifyStakeReceipt, confirmStake, type StakeAttempt } from '../../libs/stake-confirmation';

const attempt: StakeAttempt = {
  hash: `0x${'a'.repeat(64)}`, wallet: `0x${'1'.repeat(40)}`,
  token: `0x${'2'.repeat(40)}`, pool: `0x${'3'.repeat(40)}`,
  chainId: 8453, amount: '4000000', amountHex: '0x034f086f3b33b684000000',
};
function receipt() {
  return { transactionHash: attempt.hash, blockHash: `0x${'b'.repeat(64)}`, status: '0x1', logs: [{
    address: attempt.token,
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      `0x${'0'.repeat(24)}${attempt.wallet.slice(2)}`, `0x${'0'.repeat(24)}${attempt.pool.slice(2)}`],
    data: `0x${attempt.amountHex.slice(2).padStart(64, '0')}`,
  }] };
}

describe('stake confirmation', () => {
  it('recognises the exact 4 million DHB transfer despite zero padding', () => {
    expect(classifyStakeReceipt(receipt(), attempt)).toBe('confirmed');
  });
  it.each([null, undefined, {}, { error: { code: 429 } }, { ...receipt(), status: undefined }, { ...receipt(), logs: undefined }, { ...receipt(), logs: [] }, { ...receipt(), blockHash: null }])('keeps an incomplete response unresolved: %j', value => {
    expect(classifyStakeReceipt(value, attempt)).toBe('pending');
  });
  it('only reports a revert for this mined transaction', () => {
    expect(classifyStakeReceipt({ ...receipt(), status: '0x0' }, attempt)).toBe('reverted');
    expect(classifyStakeReceipt({ ...receipt(), status: '0x0', transactionHash: '0xwrong' }, attempt)).toBe('pending');
  });
  it('does not confirm another recipient, token, amount or removed transfer', () => {
    for (const changes of [{ address: attempt.pool }, { data: '0x01' }, { removed: true }, { topics: [] }]) {
      const value = receipt(); Object.assign(value.logs[0], changes);
      expect(classifyStakeReceipt(value, attempt)).toBe('pending');
    }
  });
  it('recovers a successful transfer when the first RPC fails', async () => {
    expect(await confirmStake(attempt, [async () => { throw new Error('HTTP 429'); }, async () => receipt()])).toBe('confirmed');
  });
  it('never converts unavailable RPCs into either failure or success', async () => {
    expect(await confirmStake(attempt, [async () => { throw new Error('timeout'); }, async () => null])).toBe('pending');
  });
  it('survives failure of diagnostics and can recheck the same hash later', async () => {
    expect(await confirmStake(attempt, [async () => { throw new Error('offline'); }], () => { throw new Error('storage'); })).toBe('pending');
    expect(await confirmStake(attempt, [async () => receipt()])).toBe('confirmed');
  });
  it('leaves contradictory RPC receipts unresolved', async () => {
    expect(await confirmStake(attempt, [async () => receipt(), async () => ({ ...receipt(), status: '0x0' })])).toBe('pending');
  });
});

