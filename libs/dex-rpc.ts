import { ethers } from 'ethers';
import env from '../config/env';
import { ChainId } from '../config/constants';
import type { DexChainId } from './dex-v4';

// ethers v5 wraps failed eth_call HTTP requests as CALL_EXCEPTION. Its fallback
// treats that as a definitive revert. Preserve transport errors so it can fail over.
class DexEndpointProvider extends ethers.providers.StaticJsonRpcProvider {
  async perform(method: string, params: any): Promise<any> {
    try { return await super.perform(method, params); }
    catch (error: any) {
      const cause = error?.error;
      if (error?.code === 'CALL_EXCEPTION' && (!error.data || error.data === '0x') && cause &&
          (/rate.?limit|\b429\b|exceeded maximum retry limit/i.test(String(cause)) ||
           ['TIMEOUT', 'NETWORK_ERROR'].includes(cause.code))) throw cause;
      throw error;
    }
  }
}
const providers = new Map<number, ethers.providers.FallbackProvider>();
export function dexProvider(chainId: DexChainId) {
  let provider = providers.get(chainId);
  if (!provider) {
    const urls = chainId === ChainId.BASE_MAINNET
      ? [...(env.ALCHEMY_API_KEY ? ['https://base-mainnet.g.alchemy.com/v2/' + env.ALCHEMY_API_KEY] : []), 'https://base-rpc.publicnode.com', 'https://base.drpc.org']
      : ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'];
    provider = new ethers.providers.FallbackProvider(urls.map((url, index) => ({
      provider: new DexEndpointProvider({ url, timeout: 10000, throttleLimit: 1 }, chainId),
      priority: index + 1, stallTimeout: 1000, weight: 1,
    })), 1);
    providers.set(chainId, provider);
  }
  return provider;
}

