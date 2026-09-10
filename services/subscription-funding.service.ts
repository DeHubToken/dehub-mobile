/**
 * Exact-output funding for fixed-stablecoin subscriptions.
 *
 * USDT already in the wallet is always used first. When it is short, this
 * finds a liquid route from another asset on the selected chain and buys only
 * the missing raw USDT amount before the normal subscription call runs.
 */

import { ethers } from "ethers";
import { supportedTokens, ChainId } from "../config/constants";
import { NETWORK_URLS } from "../config/web3.constants";
import { writeContractAA } from "../libs/aa.write";

const ZERO = ethers.constants.AddressZero;
const SLIPPAGE_BPS = 200;
const DEADLINE_SECONDS = 60;

type DexKind = "uniswap02" | "pancake-v3";

export interface SubscriptionDexConfig {
  kind: DexKind;
  router: string;
  quoter: string;
  wrappedNative: string;
  nativeSymbol: "ETH" | "BNB";
  feeTiers: readonly number[];
  gasReserve: ethers.BigNumber;
  routerAbi: string[];
}

const UNISWAP_ROUTER_ABI = [
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountIn)",
  "function exactOutput((bytes path,address recipient,uint256 amountOut,uint256 amountInMaximum)) payable returns(uint256 amountIn)",
  "function multicall(uint256 deadline,bytes[] data) payable returns(bytes[] results)",
  "function refundETH() payable",
];

const PANCAKE_ROUTER_ABI = [
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountIn)",
  "function exactOutput((bytes path,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum)) payable returns(uint256 amountIn)",
  "function multicall(bytes[] data) payable returns(bytes[] results)",
  "function refundETH() payable",
];

const QUOTER_ABI = [
  "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactOutput(bytes path,uint256 amountOut) returns(uint256 amountIn,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
];

const ERC20_READ_ABI = ["function balanceOf(address owner) view returns(uint256)"];

const DEX_CONFIG: Partial<Record<number, SubscriptionDexConfig>> = {
  [ChainId.BASE_MAINNET]: {
    kind: "uniswap02",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    nativeSymbol: "ETH",
    feeTiers: [100, 500, 3000, 10000],
    gasReserve: ethers.BigNumber.from("20000000000000"),
    routerAbi: UNISWAP_ROUTER_ABI,
  },
  [ChainId.BSC_MAINNET]: {
    kind: "pancake-v3",
    router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
    quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    nativeSymbol: "BNB",
    feeTiers: [100, 500, 2500, 10000],
    gasReserve: ethers.BigNumber.from("200000000000000"),
    routerAbi: PANCAKE_ROUTER_ABI,
  },
};

export interface FundingToken {
  symbol: string;
  address: string;
  decimals: number;
  balance: ethers.BigNumber;
  native: boolean;
}

export type SubscriptionFundingRoute =
  | {
      kind: "single";
      chainId: number;
      token: FundingToken;
      outputToken: string;
      amountOut: ethers.BigNumber;
      amountIn: ethers.BigNumber;
      feeTier: number;
    }
  | {
      kind: "path";
      chainId: number;
      token: FundingToken;
      outputToken: string;
      amountOut: ethers.BigNumber;
      amountIn: ethers.BigNumber;
      path: string;
    };

const providers = new Map<number, ethers.providers.JsonRpcProvider>();

function providerFor(chainId: number): ethers.providers.JsonRpcProvider {
  const existing = providers.get(chainId);
  if (existing) return existing;
  const url = NETWORK_URLS[chainId];
  if (!url) throw new Error("No RPC configured for this chain");
  const provider = new ethers.providers.JsonRpcProvider(url);
  providers.set(chainId, provider);
  return provider;
}

function isNative(address: string): boolean {
  return !address || address === "0x0" || address.toLowerCase() === ZERO.toLowerCase();
}

export function getSubscriptionDexConfig(chainId: number): SubscriptionDexConfig | null {
  return DEX_CONFIG[chainId] ?? null;
}

function withSlippage(amount: ethers.BigNumber): ethers.BigNumber {
  return amount.add(amount.mul(SLIPPAGE_BPS).div(10_000));
}

async function tokenBalance(
  token: string,
  owner: string,
  chainId: number,
): Promise<ethers.BigNumber> {
  try {
    const contract = new ethers.Contract(token, ERC20_READ_ABI, providerFor(chainId));
    return await contract.balanceOf(owner);
  } catch {
    return ethers.BigNumber.from(0);
  }
}

async function candidates(owner: string, chainId: number): Promise<FundingToken[]> {
  const config = DEX_CONFIG[chainId];
  if (!config) return [];
  const erc20s = supportedTokens.filter((token: any) => token.chainId === chainId);
  const tokens: FundingToken[] = await Promise.all([
    providerFor(chainId)
      .getBalance(owner)
      .then((balance) => ({
        symbol: config.nativeSymbol,
        address: "0x0",
        decimals: 18,
        balance,
        native: true,
      }))
      .catch(() => ({
        symbol: config.nativeSymbol,
        address: "0x0",
        decimals: 18,
        balance: ethers.BigNumber.from(0),
        native: true,
      })),
    ...erc20s.map(async (token: any) => ({
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals ?? 18,
      balance: await tokenBalance(token.address, owner, chainId),
      native: false,
    })),
  ]);
  const priority = ["USDC", "DHB", "WETH", config.nativeSymbol, "BTC"];
  return tokens
    .filter((token) => token.balance.gt(0))
    .sort((a, b) => {
      const ai = priority.indexOf(a.symbol);
      const bi = priority.indexOf(b.symbol);
      return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi);
    });
}

function exactOutputPath(
  outputToken: string,
  outputFee: number,
  wrappedNative: string,
  inputFee: number,
  inputToken: string,
): string {
  return ethers.utils.solidityPack(
    ["address", "uint24", "address", "uint24", "address"],
    [outputToken, outputFee, wrappedNative, inputFee, inputToken],
  );
}

async function bestRoute(
  chainId: number,
  token: FundingToken,
  outputToken: string,
  amountOut: ethers.BigNumber,
): Promise<SubscriptionFundingRoute | null> {
  const config = DEX_CONFIG[chainId];
  if (!config) return null;
  const tokenIn = isNative(token.address) ? config.wrappedNative : token.address;
  const quoter = new ethers.Contract(config.quoter, QUOTER_ABI, providerFor(chainId));
  const routes: SubscriptionFundingRoute[] = [];

  await Promise.all(
    config.feeTiers.map(async (feeTier) => {
      try {
        const quote = await quoter.callStatic.quoteExactOutputSingle({
          tokenIn,
          tokenOut: outputToken,
          amount: amountOut,
          fee: feeTier,
          sqrtPriceLimitX96: 0,
        });
        const amountIn = ethers.BigNumber.from(quote.amountIn ?? quote[0]);
        if (amountIn.gt(0)) {
          routes.push({ kind: "single", chainId, token, outputToken, amountOut, amountIn, feeTier });
        }
      } catch {
        // No pool or no liquidity at this size.
      }
    }),
  );

  if (
    tokenIn.toLowerCase() !== config.wrappedNative.toLowerCase() &&
    outputToken.toLowerCase() !== config.wrappedNative.toLowerCase()
  ) {
    await Promise.all(
      config.feeTiers.flatMap((outputFee) =>
        config.feeTiers.map(async (inputFee) => {
          const path = exactOutputPath(
            outputToken,
            outputFee,
            config.wrappedNative,
            inputFee,
            tokenIn,
          );
          try {
            const quote = await quoter.callStatic.quoteExactOutput(path, amountOut);
            const amountIn = ethers.BigNumber.from(quote.amountIn ?? quote[0]);
            if (amountIn.gt(0)) {
              routes.push({ kind: "path", chainId, token, outputToken, amountOut, amountIn, path });
            }
          } catch {
            // Missing path is expected while probing fee combinations.
          }
        }),
      ),
    );
  }

  routes.sort((a, b) => (a.amountIn.lt(b.amountIn) ? -1 : a.amountIn.gt(b.amountIn) ? 1 : 0));
  return routes[0] ?? null;
}

export async function findSubscriptionFundingRoute(params: {
  chainId: number;
  owner: string;
  outputToken: string;
  total: ethers.BigNumber;
}): Promise<{ balance: ethers.BigNumber; route: SubscriptionFundingRoute | null }> {
  const config = DEX_CONFIG[params.chainId];
  const balance = await tokenBalance(params.outputToken, params.owner, params.chainId);
  if (!config || balance.gte(params.total)) return { balance, route: null };

  const shortfall = params.total.sub(balance);
  const walletTokens = await candidates(params.owner, params.chainId);
  for (const token of walletTokens) {
    if (token.address.toLowerCase() === params.outputToken.toLowerCase()) continue;
    const route = await bestRoute(params.chainId, token, params.outputToken, shortfall);
    if (!route) continue;
    const maxIn = withSlippage(route.amountIn);
    const spendable = token.native
      ? token.balance.gt(config.gasReserve)
        ? token.balance.sub(config.gasReserve)
        : ethers.BigNumber.from(0)
      : token.balance;
    if (spendable.gte(maxIn)) return { balance, route };
  }
  return { balance, route: null };
}

export async function executeSubscriptionFundingRoute(params: {
  route: SubscriptionFundingRoute;
  owner: string;
  routerContract: any;
  tokenContract?: any;
}): Promise<void> {
  const { route, owner, routerContract, tokenContract } = params;
  const config = DEX_CONFIG[route.chainId];
  if (!config || !routerContract) throw new Error("Smart funding is not ready on this chain");

  const maxIn = withSlippage(route.amountIn);
  const deadline = ethers.BigNumber.from(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
  const tokenIn = isNative(route.token.address) ? config.wrappedNative : route.token.address;
  const method = route.kind === "single" ? "exactOutputSingle" : "exactOutput";
  const callParams = route.kind === "single"
    ? config.kind === "uniswap02"
      ? {
          tokenIn,
          tokenOut: route.outputToken,
          fee: route.feeTier,
          recipient: owner,
          amountOut: route.amountOut,
          amountInMaximum: maxIn,
          sqrtPriceLimitX96: 0,
        }
      : {
          tokenIn,
          tokenOut: route.outputToken,
          fee: route.feeTier,
          recipient: owner,
          deadline,
          amountOut: route.amountOut,
          amountInMaximum: maxIn,
          sqrtPriceLimitX96: 0,
        }
    : config.kind === "uniswap02"
      ? { path: route.path, recipient: owner, amountOut: route.amountOut, amountInMaximum: maxIn }
      : { path: route.path, recipient: owner, deadline, amountOut: route.amountOut, amountInMaximum: maxIn };

  if (!route.token.native) {
    if (!tokenContract) throw new Error("The source token is still loading");
    const allowance = await tokenContract.allowance(owner, config.router);
    if (ethers.BigNumber.from(allowance).lt(maxIn)) {
      const approval = await writeContractAA(
        tokenContract,
        "approve",
        [config.router, maxIn],
        { context: "approve" },
      );
      await approval.wait?.(1);
    }
    const result = await writeContractAA(routerContract, method, [callParams], { context: "swap" });
    await result.wait?.(1);
    return;
  }

  const swap = routerContract.interface.encodeFunctionData(method, [callParams]);
  const refund = routerContract.interface.encodeFunctionData("refundETH", []);
  const args = config.kind === "uniswap02"
    ? [deadline, [swap, refund]]
    : [[swap, refund]];
  const result = await writeContractAA(routerContract, "multicall", args, {
    value: maxIn,
    context: "swap",
  });
  await result.wait?.(1);
}

export async function waitForSubscriptionFunding(params: {
  chainId: number;
  owner: string;
  outputToken: string;
  total: ethers.BigNumber;
  attempts?: number;
}): Promise<boolean> {
  let balance = ethers.BigNumber.from(0);
  const attempts = params.attempts ?? 6;
  for (let attempt = 0; attempt < attempts; attempt++) {
    balance = await tokenBalance(params.outputToken, params.owner, params.chainId);
    if (balance.gte(params.total)) return true;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
}
