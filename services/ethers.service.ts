import { ethers } from "ethers";
import { supportedTokens, ChainId, MULTICALL2_ADDRESSES } from "../config/constants";
import { createLogger } from "../libs/logger";

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
  private log = createLogger("EthersService");

  private getMulticallContract(chainId: number) {
    const addr = MULTICALL2_ADDRESSES[chainId];
    if (!addr) return null;
    const provider = this.getProvider(chainId);
    // Use require to avoid TS JSON module config constraints
    const multicallAbi = require("../config/abis/multicall.json");
    return new ethers.Contract(addr, multicallAbi, provider);
  }

  private erc20Iface = new ethers.utils.Interface([
    "function balanceOf(address owner) view returns (uint256)",
  ]);

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
    // Try multicall fast-path first
    try {
      const mc = this.getMulticallContract(chainId);
      if (mc) {
        const t0 = Date.now();
        const calls: { target: string; callData: string }[] = [];
        // getEthBalance via multicall helper
        try {
          const mcIface = mc.interface as ethers.utils.Interface;
          const data = mcIface.encodeFunctionData("getEthBalance", [address]);
          calls.push({ target: mc.address, callData: data });
        } catch {}
        // ERC20 balanceOf calls
        for (const t of tokens) {
          try {
            const data = this.erc20Iface.encodeFunctionData("balanceOf", [
              address,
            ]);
            calls.push({ target: t.address, callData: data });
          } catch {}
        }
        if (calls.length > 0) {
          const res: any[] = await mc.tryAggregate(false, calls);
          let idx = 0;
          // Native
          if (res.length > 0) {
            try {
              const nativeReturn = res[idx++];
              const ok = nativeReturn?.success;
              const ret: string = nativeReturn?.returnData;
              if (ok && ret) {
                const mcIface = mc.interface as ethers.utils.Interface;
                const decoded = mcIface.decodeFunctionResult(
                  "getEthBalance",
                  ret
                );
                const eth = decoded?.[0] as ethers.BigNumber;
                balances["ETH"] = parseFloat(ethers.utils.formatEther(eth));
              } else {
                const fallback = await provider
                  .getBalance(address)
                  .catch(() => ethers.BigNumber.from(0));
                balances["ETH"] = parseFloat(
                  ethers.utils.formatEther(fallback)
                );
              }
            } catch {
              const fallback = await provider
                .getBalance(address)
                .catch(() => ethers.BigNumber.from(0));
              balances["ETH"] = parseFloat(
                ethers.utils.formatEther(fallback)
              );
            }
          }
          // Tokens
          for (const t of tokens) {
            try {
              const r = res[idx++];
              if (r?.success && r?.returnData) {
                const [raw] = this.erc20Iface.decodeFunctionResult(
                  "balanceOf",
                  r.returnData
                );
                const val = parseFloat(
                  ethers.utils.formatUnits(raw as ethers.BigNumber, t.decimals)
                );
                balances[t.symbol] = val;
              } else {
                balances[t.symbol] = 0;
              }
            } catch (e) {
              balances[t.symbol] = 0;
            }
          }
          this.log.debug("balances:multicall:done", {
            totalMs: Date.now() - t0,
            count: tokens.length + 1,
          });
          return balances;
        }
      }
    } catch (e) {
      this.log.warn("balances:multicall:error", e);
    }
    const t0 = Date.now();
    // Native balance timing
    try {
      const tNative = Date.now();
      const native = await provider
        .getBalance(address)
        .catch(() => ethers.BigNumber.from(0));
      balances["ETH"] = parseFloat(ethers.utils.formatEther(native));
      this.log.debug("balances:native", {
        chainId,
        ms: Date.now() - tNative,
      });
    } catch {
      balances["ETH"] = 0;
    }
    // ERC-20 balances in parallel with per-token timing
    await Promise.all(
      tokens.map(async (t) => {
        const tTok = Date.now();
        try {
          const raw = await this.getErc20Balance(t.address, address, chainId);
          const val = parseFloat(ethers.utils.formatUnits(raw, t.decimals));
          balances[t.symbol] = val;
          this.log.debug("balances:token", {
            symbol: t.symbol,
            ms: Date.now() - tTok,
          });
        } catch (e) {
          balances[t.symbol] = 0;
          this.log.warn("balances:token:error", { symbol: t.symbol, e });
        }
      })
    );
    this.log.debug("balances:all:done", { totalMs: Date.now() - t0 });
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
