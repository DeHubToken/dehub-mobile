import { ethers } from "ethers";
import { supportedTokens, ChainId } from "../config/constants";

// Simple JSON RPC endpoints (could be moved to env)
const RPC_ENDPOINTS: Record<number, string> = {
  [ChainId.BASE_MAINNET]: "https://mainnet.base.org",
  [ChainId.BSC_MAINNET]: "https://bsc-dataseed.binance.org",
  [ChainId.BSC_TESTNET]: "https://data-seed-prebsc-1-s1.binance.org:8545",
  [ChainId.GORLI]: "https://goerli.blockpi.network/v1/rpc/public",
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
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

  async getErc20Balance(
    tokenAddress: string,
    address: string,
    chainId: number
  ) {
    const provider = this.getProvider(chainId);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const bal: ethers.BigNumber = await contract.balanceOf(address);
    return bal; // BigNumber
  }

  async getTokenBalances(address: string, chainId: number, symbols: string[]) {
    const tokens = supportedTokens.filter(
      (t) => t.chainId === chainId && symbols.includes(t.symbol)
    );
    const balances: Record<string, number> = {};
    const provider = this.getProvider(chainId);
    const native = await provider
      .getBalance(address)
      .catch(() => ethers.BigNumber.from(0));
    // Treat native as ETH/WETH alias for display (use ETH key)
    try {
      balances["ETH"] = parseFloat(ethers.utils.formatEther(native));
    } catch {
      balances["ETH"] = 0;
    }
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

  createProviderFromWeb3Auth = async (web3authProvider: any) => {
    if (!web3authProvider) {
      throw new Error("Web3Auth provider is required");
    }

    // For React Native, don't use BrowserProvider
    // Use Web3Provider from ethers v5 or JsonRpcProvider for v6

    // If using ethers v6:
    const provider = new ethers.providers.JsonRpcProvider(
      "https://mainnet.base.org",
      {
        chainId: 8453,
        name: "base-mainnet",
      }
    );

    // Get private key from Web3Auth
    const privateKey = await web3authProvider.request({
      method: "private_key",
    });

    if (!privateKey) {
      throw new Error("Failed to get private key from Web3Auth");
    }

    // Create wallet with provider
    const wallet = new ethers.Wallet(privateKey, provider);
    return { provider, signer: wallet };
  };

  // Alternative for ethers v5 (if you're using v5):
  createProviderFromWeb3AuthV5 = async (web3authProvider: any) => {
    // Use Web3Provider for v5
    const provider = new ethers.providers.Web3Provider(web3authProvider);

    // This should work with v5
    const signer = provider.getSigner();
    return { provider, signer };
  };
}

export const ethersService = new EthersService();
