import { classifyStakeReceipt, confirmStake, recoverStake, STAKE_MISSING_GRACE_MS, type StakeEvidence, refreshConfirmedStake, stakeFromReplacement, type StakeAttempt } from '../../libs/stake-confirmation';

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
  it('accepts the mined viem receipt without another network round trip', () => {
    expect(classifyStakeReceipt({ ...receipt(), status: 'success' }, attempt)).toBe('confirmed');
    expect(classifyStakeReceipt({ ...receipt(), status: 'reverted' }, attempt)).toBe('reverted');
  });
  it('reports the amount actually mined when the wallet replaces a deposit', () => {
    const value = receipt();
    value.transactionHash = `0x${'c'.repeat(64)}`;
    value.logs[0].data = '0x22e1eb24578aa5375c80';
    const replaced = stakeFromReplacement(value, { ...attempt, amount: '330000' });
    expect(replaced).toMatchObject({ hash: value.transactionHash, amount: '164727.92159810365' });
    expect(classifyStakeReceipt(value, replaced!)).toBe('confirmed');
    expect(classifyStakeReceipt(value, attempt)).toBe('pending');
  });
  it('does not turn a wallet cancellation or unrelated transfer into a deposit', () => {
    const value = receipt();
    value.logs[0].topics[2] = `0x${'0'.repeat(24)}${attempt.wallet.slice(2)}`;
    expect(stakeFromReplacement(value, attempt)).toBeNull();
    expect(stakeFromReplacement({ ...receipt(), status: '0x0' }, attempt)).toBeNull();
    expect(stakeFromReplacement({ ...receipt(), blockHash: null }, attempt)).toBeNull();
  });
  it('refreshes the balance even when deposit history is unavailable', async () => {
    const calls: string[] = [];
    await refreshConfirmedStake(
      async () => { calls.push('position'); },
      async () => { calls.push('history'); throw new Error('history offline'); },
      async () => { calls.push('balances'); },
    );
    expect(calls).toEqual(['position', 'history', 'balances']);
  });
});

describe('pending stake recovery after a reload', () => {
  const now = 2_000_000_000_000;
  const old = { ...attempt, submittedAt: now - STAKE_MISSING_GRACE_MS };
  const missing = { receipt: null, transaction: null, latestNonce: '0x6', pendingNonce: '0x6' };
  const read = (value: StakeEvidence) => async () => value;
  const recover = (saved: StakeAttempt, values: StakeEvidence[]) => recoverStake(saved, values.map(read), undefined, now);

  it('retires the historical missing 330,000 attempt without inventing a deposit or resending', async () => {
    expect((await recover({ ...old, amount: '330000' }, [missing, missing])).outcome).toBe('not-found');
  });
  it('recognises a spent transaction nonce as replacement after a restart', async () => {
    expect((await recover({ ...attempt, nonce: '0x5' }, [missing, missing])).outcome).toBe('replaced');
  });
  it('saves the nonce actually observed on the original transaction', async () => {
    const visible = { receipt: null, transaction: { hash: attempt.hash, from: attempt.wallet, nonce: '0x5', blockNumber: null } };
    expect(await recover(old, [visible, missing])).toMatchObject({ outcome: 'pending', attempt: { nonce: '0x5' } });
    expect((await recover(old, [{ ...visible, transaction: { ...visible.transaction, from: attempt.pool } }, missing])).attempt.nonce).toBeUndefined();
  });
  it('does not expire new transactions or legacy records without a timestamp', async () => {
    expect((await recover({ ...old, submittedAt: now - STAKE_MISSING_GRACE_MS + 1 }, [missing, missing])).outcome).toBe('pending');
    expect(await recover(attempt, [missing, missing])).toMatchObject({ outcome: 'pending', attempt: { submittedAt: now } });
  });
  it('keeps visible transactions and mined receipts with an unexpected transfer unresolved', async () => {
    expect((await recover(old, [{ ...missing, transaction: { hash: attempt.hash } }, missing])).outcome).toBe('pending');
    expect((await recover(old, [{ ...missing, receipt: { ...receipt(), logs: [] } }, missing])).outcome).toBe('pending');
  });
  it('requires two healthy RPCs and matching idle wallet nonces', async () => {
    for (const values of [[missing], [missing, { ...missing, pendingNonce: '0x7' }], [missing, { ...missing, latestNonce: '0x7', pendingNonce: '0x7' }], [missing, { ...missing, latestNonce: undefined }]]) {
      expect((await recover(old, values)).outcome).toBe('pending');
    }
    expect((await recoverStake(old, [read(missing), async () => { throw new Error('HTTP 429'); }], undefined, now)).outcome).toBe('pending');
  });
  it('preserves confirmed and reverted receipts and rejects conflicting RPCs', async () => {
    expect((await recover(old, [{ ...missing, receipt: receipt() }, missing])).outcome).toBe('confirmed');
    const reverted = { ...missing, receipt: { ...receipt(), status: '0x0' } };
    expect((await recover(old, [reverted, missing])).outcome).toBe('reverted');
    expect((await recover(old, [{ ...missing, receipt: receipt() }, reverted])).outcome).toBe('pending');
  });
});
