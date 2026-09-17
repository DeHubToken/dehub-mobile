
import { isPrimaryPayment, preferredPayment, readPaymentBalances } from '../../libs/payment-options';
import type { PaymentAsset } from '../../libs/crypto-purchase';
const base: PaymentAsset = { assetId: 'base', symbol: 'ETH', blockchain: 'base', decimals: 18, route: 'direct' };
const sol: PaymentAsset = { assetId: 'sol', symbol: 'SOL', blockchain: 'sol', decimals: 9 };
const bnb: PaymentAsset = { assetId: 'bnb', symbol: 'BNB', blockchain: 'bsc', decimals: 18, route: 'direct' };
afterEach(() => { jest.restoreAllMocks(); });
it('prefers owned direct funds over an empty Base wallet or a swap', () => {
  expect(preferredPayment([base, sol, bnb], { base: '0', sol: '10', bnb: '2' })).toEqual(bnb);
  expect(preferredPayment([base, sol], { base: '0', sol: '10' })).toEqual(sol);
  expect(preferredPayment([base], { base: null })).toBeUndefined();
});
it('keeps other currencies and chains out of the initial network picker', () => {
  expect(isPrimaryPayment({ ...base, blockchain: 'arb' })).toBe(false);
  expect(isPrimaryPayment({ ...base, symbol: 'DOGE' })).toBe(false);
  expect(isPrimaryPayment({ ...base, blockchain: 'robinhood' })).toBe(true);
});
it('distinguishes an RPC failure from a zero balance and never uses another chain', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === 'base-rpc') return { ok: true, json: async () => ({ result: '0x0' }) } as Response;
    throw new Error('offline');
  });
  const balances = await readPaymentBalances([base, bnb], '0x1111111111111111111111111111111111111111', undefined, { base: 'base-rpc', bsc: 'bnb-rpc' });
  expect(balances).toEqual({ base: '0', bnb: null });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('reads decimals from the matching contract instead of trusting stale metadata', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => ({ ok: true, json: async () => ({ result: JSON.parse(String(options?.body)).params[0].data === '0x313ce567' ? '0x6' : '0xf4240' }) } as Response));
  const token = { ...base, assetId: 'usdc', symbol: 'USDC', contractAddress: '0x2222222222222222222222222222222222222222', decimals: 18 };
  expect(await readPaymentBalances([token], '0x1111111111111111111111111111111111111111', undefined, { base: 'rpc' })).toEqual({ usdc: '1' });
});
