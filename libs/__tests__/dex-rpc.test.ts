import { ethers } from 'ethers';
jest.mock('../../config/env', () => ({ __esModule: true, default: { ALCHEMY_API_KEY: 'test-key' } }));
jest.mock('../../config/constants', () => ({ ChainId: { BASE_MAINNET: 8453, BSC_MAINNET: 56 } }));
import { dexProvider } from '../dex-rpc';
import { dexActionError } from '../dex-action-error';

it('uses the configured RPC and reads through a backup after rate limiting', async () => {
  const provider = dexProvider(8453);
  const configs = provider.providerConfigs;
  expect(configs.map(c => (c.provider as ethers.providers.StaticJsonRpcProvider).connection.url)).toEqual([
    'https://base-mainnet.g.alchemy.com/v2/test-key', 'https://base-rpc.publicnode.com', 'https://base.drpc.org',
  ]);
  const calls = configs.map((config, index) => jest.spyOn(config.provider as ethers.providers.StaticJsonRpcProvider, 'send').mockImplementation(async method => {
    if (method === 'eth_call' && index === 0) throw Object.assign(new Error('429 over rate limit'), { code: 'SERVER_ERROR' });
    return method === 'eth_blockNumber' ? '0x100' : method === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(63) + '1';
  }));
  await expect(provider.call({ to: '0x0000000000000000000000000000000000000001', data: '0x12345678' })).resolves.toBe('0x' + '0'.repeat(63) + '1');
  expect(calls[1]).toHaveBeenCalled();
  calls[1].mockClear();
  jest.spyOn(configs[0].provider as ethers.providers.StaticJsonRpcProvider, 'perform').mockRejectedValue(Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION', data: '0xdeadbeef' }));
  await expect(provider.call({ to: '0x0000000000000000000000000000000000000001', data: '0x87654321' })).rejects.toMatchObject({ code: 'CALL_EXCEPTION' });
  expect(calls[1]).not.toHaveBeenCalled();
});
it('explains rate limits without declaring whether a transaction was submitted', () => {
  expect(dexActionError(new Error('exceeded maximum retry limit (429)'))).toContain('check your wallet activity');
  expect(dexActionError(new Error('Insufficient DHB'))).toBe('Insufficient DHB');
});
