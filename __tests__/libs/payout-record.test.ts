import {
  persistPayout,
  PaidButUnrecordedError,
  paidButUnrecordedMessage,
} from '../../libs/payout-record';

const noSleep = () => Promise.resolve();

describe('libs/payout-record', () => {
  it('writes once when the write lands', async () => {
    const write = jest.fn().mockResolvedValue({ error: null });

    await persistPayout(write, '0xabc', { sleep: noSleep });

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('builds a fresh query per attempt, because an awaited builder does not re-run', async () => {
    const write = jest
      .fn()
      .mockResolvedValueOnce({ error: { message: 'network' } })
      .mockResolvedValueOnce({ error: null });

    await persistPayout(write, '0xabc', { sleep: noSleep });

    expect(write).toHaveBeenCalledTimes(2);
  });

  it('counts a thrown request as a failed attempt', async () => {
    const write = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ error: null });

    await persistPayout(write, '0xabc', { sleep: noSleep });

    expect(write).toHaveBeenCalledTimes(2);
  });

  // The reason this module exists: the transfer has already left the poster's
  // wallet, so a failure here must never read as "payment failed" — that is
  // what gets a worker paid twice.
  it('says the money already moved when the row will not save', async () => {
    const write = jest.fn().mockResolvedValue({ error: { message: 'row level security' } });
    const hash = '0x9f2c1d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d';

    await expect(persistPayout(write, hash, { attempts: 3, sleep: noSleep })).rejects.toBeInstanceOf(
      PaidButUnrecordedError,
    );
    expect(write).toHaveBeenCalledTimes(3);

    const message = paidButUnrecordedMessage(hash);
    expect(message).toContain('already sent');
    expect(message).toContain('Do not pay again');
    expect(message).toContain('0x9f2c1d');
  });

  it('surfaces the underlying error when nothing was spent', async () => {
    const underlying = new Error('row level security');
    const write = jest.fn().mockResolvedValue({ error: underlying });

    await expect(persistPayout(write, null, { attempts: 2, sleep: noSleep })).rejects.toBe(
      underlying,
    );
  });
});
