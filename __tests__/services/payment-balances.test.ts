import { loadPaymentBalances } from '../../services/payment-balances';
import { preferredPayment } from '../../libs/payment-options';
import type { PaymentAsset } from '../../libs/crypto-purchase';

jest.mock('../../libs/identity-wallet', () => ({ getCachedSolanaAddress: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../config/web3.constants', () => ({ NETWORK_URLS: { 1: 'eth-configured', 8453: 'base-configured', 56: 'bsc-configured', 4663: 'robinhood-configured' } }));
jest.mock('../../config/solana.constants', () => ({ getSolanaRpcUrl: () => 'sol-configured' }));

const wallet = '0x1111111111111111111111111111111111111111';
const eth: PaymentAsset = { assetId: 'ethereum-eth', symbol: 'ETH', blockchain: 'eth', decimals: 18 };
const base: PaymentAsset = { ...eth, assetId: 'base-eth', blockchain: 'base', route: 'direct' };
const success = (result: string) => ({ ok: true, json: async () => ({ result }) }) as Response;

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('shows and selects funded Ethereum when the configured RPC rejects Buy balance reads', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === 'base-configured') return success('0x0');
    if (url === 'eth-configured') return { ok: false, status: 401, json: async () => ({ error: { message: 'unauthorized' } }) } as Response;
    if (url === 'https://ethereum-rpc.publicnode.com') return success('0xde0b6b3a7640000');
    throw new Error('Unexpected endpoint');
  });
  const balances = await loadPaymentBalances([base, eth], wallet);
  expect(balances).toEqual({ 'base-eth': '0', 'ethereum-eth': '1' });
  expect(preferredPayment([base, eth], balances)).toEqual(eth);
  expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(['base-configured', 'eth-configured', 'https://ethereum-rpc.publicnode.com'].sort());
  for (const [, options] of fetchMock.mock.calls) {
    expect(JSON.parse(String(options?.body))).toMatchObject({ method: 'eth_getBalance', params: [wallet, 'latest'] });
  }
});

it('tries only Ethereum endpoints and keeps a failed balance unknown', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  expect(await loadPaymentBalances([eth], wallet)).toEqual({ 'ethereum-eth': null });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['eth-configured', 'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org']);
});

it('moves past a stalled Ethereum RPC after four seconds', async () => {
  jest.useFakeTimers();
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (url === 'eth-configured') return new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    });
    return success('0xde0b6b3a7640000');
  });
  const pending = loadPaymentBalances([eth], wallet);
  await jest.advanceTimersByTimeAsync(4000);
  expect(await pending).toEqual({ 'ethereum-eth': '1' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

