import { ethers } from 'ethers';
import { supportedTokens, ChainId } from '../config/constants';

// Simple JSON RPC endpoints (could be moved to env)
const RPC_ENDPOINTS: Record<number, string> = {
  [ChainId.BASE_MAINNET]: 'https://mainnet.base.org',
  [ChainId.BSC_MAINNET]: 'https://bsc-dataseed.binance.org',
  [ChainId.BSC_TESTNET]: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  [ChainId.GORLI]: 'https://goerli.blockpi.network/v1/rpc/public',
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class EthersService {
  private providers: Map<number, ethers.providers.JsonRpcProvider> = new Map();

  getProvider(chainId: number) {
    if (!this.providers.has(chainId)) {
      const url = RPC_ENDPOINTS[chainId];
      if (!url) throw new Error(`No RPC endpoint for chain ${chainId}`);
      this.providers.set(chainId, new ethers.providers.JsonRpcProvider(url));
    }
    return this.providers.get(chainId)!;
  }

  async getNativeBalance(address: string, chainId: number) {
    const provider = this.getProvider(chainId);
    const bal = await provider.getBalance(address);
    return bal; // BigNumber
  }

  async getErc20Balance(tokenAddress: string, address: string, chainId: number) {
    const provider = this.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const bal: ethers.BigNumber = await contract.balanceOf(address);
    return bal; // BigNumber
  }

  async getTokenBalances(address: string, chainId: number, symbols: string[]) {
    const tokens = supportedTokens.filter(t => t.chainId === chainId && symbols.includes(t.symbol));
    const balances: Record<string, number> = {};
    const provider = this.getProvider(chainId);
    const native = await provider.getBalance(address).catch(() => ethers.BigNumber.from(0));
    // Treat native as ETH/WETH alias for display (use ETH key)
    try { balances['ETH'] = parseFloat(ethers.utils.formatEther(native)); } catch { balances['ETH'] = 0; }
    for (const t of tokens) {
      try {
        const raw = await this.getErc20Balance(t.address, address, chainId);
        const val = parseFloat(ethers.utils.formatUnits(raw, t.decimals));
        balances[t.symbol] = val;
      } catch {
        balances[t.symbol] = 0;
      }
    }
    return balances;
  }
}

export const ethersService = new EthersService();
