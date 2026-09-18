import { readReceiptFromProviders } from '../dex-receipt';

const hash = '0xmint';
it('recovers a confirmed mint when the first RPC rejects archive access', async () => {
  const confirmed = { status: 1, logs: [{ tokenId: '3069432' }] };
  const result = await readReceiptFromProviders([
    { getTransactionReceipt: async () => { throw new Error('403 Archive requests require a personal token'); } },
    { getTransactionReceipt: async () => confirmed },
  ], hash);
  expect(result).toBe(confirmed);
});
it('checks another RPC when one has not seen the transaction', async () => {
  const reverted = { status: 0 };
  expect(await readReceiptFromProviders([
    { getTransactionReceipt: async () => null },
    { getTransactionReceipt: async () => reverted },
  ], hash)).toBe(reverted);
});
it('distinguishes a missing receipt from every RPC failing', async () => {
  expect(await readReceiptFromProviders([{ getTransactionReceipt: async () => null }], hash)).toBeNull();
  await expect(readReceiptFromProviders([{ getTransactionReceipt: async () => { throw new Error('offline'); } }], hash)).rejects.toThrow('offline');
});
