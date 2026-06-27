/**
 * Uniswap V3 Swap (Base) — ETH → DHB auto-swap for PPV unlocks (#44).
 * Ported from the web app's uniswap-swap util to mobile (ethers v5 + AA writes).
 */
import { ethers } from "ethers";
import { writeContractAA } from "../libs/aa.write";
import { ChainId } from "../config/constants";
import { NETWORK_URLS } from "../config/web3.constants";

// ── Contract addresses (Base mainnet) ──
export const UNISWAP_SWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const UNISWAP_QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";

const FEE_TIERS = [10000, 3000, 500] as const; // 1%, 0.3%, 0.05%
const SWAP_DEADLINE_SECONDS = 30;
const SLIPPAGE_BPS = 200; // 2%

// Human-readable ABIs (ethers v5 accepts string[] fragments)
export const SWAP_ROUTER_ABI = [
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)",
  "function refundETH() external payable",
  "function multicall(uint256 deadline, bytes[] data) external payable returns (bytes[] memory)",
];

const QUOTER_ABI = [
  "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

let baseProvider: ethers.providers.JsonRpcProvider | null = null;
function getBaseProvider(): ethers.providers.JsonRpcProvider {
  if (!baseProvider) {
    const url = NETWORK_URLS[ChainId.BASE_MAINNET] || "https://mainnet.base.org";
    baseProvider = new ethers.providers.JsonRpcProvider(url);
  }
  return baseProvider;
}

/** Auto-swap is only available where DHB has Uniswap V3 liquidity — Base. */
export function isAutoSwapSupported(chainId?: number): boolean {
  return chainId === ChainId.BASE_MAINNET;
}

/** Add a slippage buffer (basis points) to a wei amount. */
export function applySlippage(amountWei: ethers.BigNumber, bps = SLIPPAGE_BPS): ethers.BigNumber {
  return amountWei.add(amountWei.mul(bps).div(10000));
}

/** Native ETH balance on Base for an address. */
export async function getNativeBalanceBase(address: string): Promise<ethers.BigNumber> {
  return getBaseProvider().getBalance(address);
}

export interface SwapQuote {
  amountIn: ethers.BigNumber;
  feeTier: number;
}

/**
 * Quote how much ETH (WETH) is needed to receive `amountOut` DHB.
 * Tries each fee tier and returns the cheapest. Null if no pool has liquidity.
 */
export async function getSwapQuote(amountOut: ethers.BigNumber): Promise<SwapQuote | null> {
  const provider = getBaseProvider();
  const quoter = new ethers.Contract(UNISWAP_QUOTER_V2, QUOTER_ABI, provider);
  const results: SwapQuote[] = [];

  for (const fee of FEE_TIERS) {
    try {
      const res = await quoter.callStatic.quoteExactOutputSingle({
        tokenIn: WETH_BASE,
        tokenOut: DHB_BASE,
        amount: amountOut,
        fee,
        sqrtPriceLimitX96: 0,
      });
      const amountIn: ethers.BigNumber = res.amountIn ?? res[0];
      results.push({ amountIn, feeTier: fee });
    } catch {
      // No pool / liquidity for this fee tier — skip.
    }
  }

  if (!results.length) return null;
  results.sort((a, b) => (a.amountIn.lt(b.amountIn) ? -1 : 1));
  return results[0];
}

/**
 * Swap native ETH → exact DHB out via Uniswap V3 SwapRouter (multicall + refundETH).
 * `routerContract` must be an AA-aware ethers.Contract for UNISWAP_SWAP_ROUTER on Base.
 */
export async function swapETHForDHB(params: {
  routerContract: any;
  amountOutDHB: ethers.BigNumber;
  maxETH: ethers.BigNumber;
  recipient: string;
  feeTier: number;
}): Promise<{ hash?: string }> {
  const { routerContract, amountOutDHB, maxETH, recipient, feeTier } = params;
  const deadline = ethers.BigNumber.from(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);

  const swapCalldata = routerContract.interface.encodeFunctionData("exactOutputSingle", [
    {
      tokenIn: WETH_BASE,
      tokenOut: DHB_BASE,
      fee: feeTier,
      recipient,
      amountOut: amountOutDHB,
      amountInMaximum: maxETH,
      sqrtPriceLimitX96: 0,
    },
  ]);
  const refundCalldata = routerContract.interface.encodeFunctionData("refundETH", []);

  const res = await writeContractAA(
    routerContract,
    "multicall",
    [deadline, [swapCalldata, refundCalldata]],
    { value: maxETH, context: "swap" },
  );
  await res.wait?.(1);
  return { hash: res.hash };
}
