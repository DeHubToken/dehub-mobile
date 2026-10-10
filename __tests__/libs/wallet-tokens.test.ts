import { ethers } from 'ethers';
jest.mock('../../config/web3.constants', () => ({ NETWORK_URLS: { 8453: 'base-rpc', 1: 'ethereum-rpc' } }));
jest.mock('../../config/solana.constants', () => ({ SOLANA_MAINNET_CHAIN_ID: 101, SOLANA_SPL_TOKENS: [], getSolanaRpcUrl: () => 'solana-rpc' }));
import { groupWalletTokens, readWalletTokens, type WalletToken } from '../../libs/wallet-tokens';

afterEach(() => jest.restoreAllMocks());
const owner = '0x1111111111111111111111111111111111111111';
const rpcResult = (result: string) => ({ ok: true, json: async () => ({ result }) }) as Response;

it('reads Ethereum through public RPC without a signing provider', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => rpcResult(ethers.utils.hexZeroPad('0x00', 32)));
  const tokens = await readWalletTokens(owner, 1);
  expect(tokens.find(token => token.isNative)).toMatchObject({ symbol: 'ETH', balance: '0.0', chainId: 1 });
  expect(fetchMock.mock.calls.every(([url]) => url === 'ethereum-rpc')).toBe(true);
});

it('preserves known balances and marks an individual failure as unknown', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    if (request.method === 'eth_call') throw new Error('offline');
    return rpcResult('0xde0b6b3a7640000');
  });
  const tokens = await readWalletTokens(owner, 8453);
  expect(tokens.find(token => token.isNative)?.balance).toBe('1.0');
  expect(tokens.filter(token => !token.isNative).every(token => token.balance === null)).toBe(true);
});

it('rejects an unavailable chain instead of succeeding with zero balances', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  await expect(readWalletTokens(owner, 8453)).rejects.toThrow('Balance unavailable');
});

it('groups decimal amounts across chains without mixing raw precisions', () => {
  const token = { address: owner, symbol: 'USDT', name: 'Tether' };
  const tokens: WalletToken[] = [
    { ...token, chainId: 8453, decimals: 6, balance: '1.25' },
    { ...token, chainId: 56, decimals: 18, balance: '2.75' },
    { ...token, chainId: 1, decimals: 6, balance: null },
  ];
  expect(groupWalletTokens(tokens)[0]).toMatchObject({ amount: 4, unknown: true, tokens });
});
