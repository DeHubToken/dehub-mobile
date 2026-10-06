import { receiptRpcUrls, TransactionConfirmationPendingError, waitForSubmittedReceipt } from '../../libs/transaction-receipt';

afterEach(() => jest.useRealTimers());

describe('submitted transaction confirmation', () => {
  const receipt = { status: 1, transactionHash: '0xtip' };

  it('recovers a mined payment when the original RPC errors and another is stale', async () => {
    const wait = jest.fn(async () => { throw new Error('archive request denied'); });
    const readers = [jest.fn(async () => null), jest.fn(async () => receipt)];
    await expect(waitForSubmittedReceipt('0xtip', wait, readers)).resolves.toBe(receipt);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(readers[1]).toHaveBeenCalledTimes(1);
  });

  it('preserves the receipt of a mined revert', async () => {
    const reverted = { ...receipt, status: 0 };
    await expect(waitForSubmittedReceipt('0xtip', async () => { throw { receipt: reverted }; }, []))
      .resolves.toBe(reverted);
  });

  it('does not count a cancelled replacement as payment', async () => {
    const cancelled = { code: 'TRANSACTION_REPLACED', cancelled: true, receipt };
    const read = jest.fn(async () => receipt);
    await expect(waitForSubmittedReceipt('0xtip', async () => { throw cancelled; }, [read])).rejects.toBe(cancelled);
    expect(read).not.toHaveBeenCalled();
  });

  it('retains the submitted hash when receipt lookup is unavailable', async () => {
    const error = await waitForSubmittedReceipt('0xtip', async () => null, [async () => null]).catch(error => error);
    expect(error).toBeInstanceOf(TransactionConfirmationPendingError);
    expect(error.hash).toBe('0xtip');
    expect(error.message).toContain('before sending again');
  });

  it('recovers a hung wait without repeating the transaction', async () => {
    jest.useFakeTimers();
    const read = jest.fn(async () => receipt);
    const result = waitForSubmittedReceipt('0xtip', () => new Promise(() => {}), [read], 1000);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe(receipt);
    expect(read).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('deduplicates independent chain fallbacks', () => {
    expect(receiptRpcUrls(8453, 'https://mainnet.base.org')).toEqual([
      'https://mainnet.base.org', 'https://base-rpc.publicnode.com',
    ]);
    expect(receiptRpcUrls(56, 'https://configured.example')).toHaveLength(3);
  });
});
