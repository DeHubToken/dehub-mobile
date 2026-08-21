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
  "function exactOutput((bytes path, address recipient, uint256 amountOut, uint256 amountInMaximum)) external payable returns (uint256 amountIn)",
  "function refundETH() external payable",
  "function multicall(uint256 deadline, bytes[] data) external payable returns (bytes[] memory)",
];

const QUOTER_ABI = [
  "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactOutput(bytes path, uint256 amountOut) external returns (uint256 amountIn, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
];

const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

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

// ── Buying an exact amount of DHB out of whatever the wallet holds ──────────
//
// DHB's only pool on Base is DHB/WETH, so `getSwapQuote` above answers for ETH
// and for nothing else. A viewer holding USDC — which is most of them — had no
// route at all and was told to go and find DHB themselves. Routing through
// WETH gives every liquid Base token a path.

/** A priced way of buying DHB with one wallet token. */
export type DhbBuyRoute =
  | { kind: "single"; tokenIn: string; amountIn: ethers.BigNumber; feeTier: number }
  | { kind: "path"; tokenIn: string; amountIn: ethers.BigNumber; path: string };

/** Fee tiers for the token↔WETH leg: stables sit low, volatile pairs high. */
const MID_FEE_TIERS = [500, 100, 3000, 10000] as const;

/** ERC20 balance on Base, read-only. Zero on any RPC trouble. */
export async function getERC20BalanceBase(
  tokenAddress: string,
  owner: string,
): Promise<ethers.BigNumber> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_BALANCE_ABI, getBaseProvider());
    return await contract.balanceOf(owner);
  } catch {
    return ethers.BigNumber.from(0);
  }
}

/**
 * Encode a Uniswap V3 exactOutput path. These run OUTPUT first, so the bytes
 * read DHB → fee → WETH → fee → tokenIn even though the trade goes the other
 * way. The quoter uses the same encoding, so a path built backwards fails at
 * the quote and never reaches a signature.
 */
function encodeExactOutputPath(tokenIn: string, midFee: number, dhbFee: number): string {
  return ethers.utils.solidityPack(
    ["address", "uint24", "address", "uint24", "address"],
    [DHB_BASE, dhbFee, WETH_BASE, midFee, tokenIn],
  );
}

const isNativeOrWeth = (address: string) =>
  !address ||
  address === "0x0" ||
  address === ethers.constants.AddressZero ||
  address.toLowerCase() === WETH_BASE.toLowerCase();

/**
 * Cheapest route from `tokenInAddress` to an exact `amountOutDhb`, or null when
 * that token has no liquidity path at this size. A pool that doesn't exist
 * reverts in the static call, costs nothing, and drops out of the results.
 */
export async function quoteDhbPurchase(
  amountOutDhb: ethers.BigNumber,
  tokenInAddress: string,
): Promise<DhbBuyRoute | null> {
  // ETH and WETH trade against DHB directly.
  if (isNativeOrWeth(tokenInAddress)) {
    const quote = await getSwapQuote(amountOutDhb);
    return quote
      ? { kind: "single", tokenIn: tokenInAddress, amountIn: quote.amountIn, feeTier: quote.feeTier }
      : null;
  }

  const quoter = new ethers.Contract(UNISWAP_QUOTER_V2, QUOTER_ABI, getBaseProvider());
  const attempts = MID_FEE_TIERS.flatMap((midFee) =>
    FEE_TIERS.map(async (dhbFee) => {
      const path = encodeExactOutputPath(tokenInAddress, midFee, dhbFee);
      try {
        const res = await quoter.callStatic.quoteExactOutput(path, amountOutDhb);
        const amountIn: ethers.BigNumber = res.amountIn ?? res[0];
        return { kind: "path" as const, tokenIn: tokenInAddress, amountIn, path };
      } catch {
        return null;
      }
    }),
  );

  const routes = (await Promise.all(attempts)).filter(
    (r): r is Extract<DhbBuyRoute, { kind: "path" }> => !!r && r.amountIn.gt(0),
  );
  if (!routes.length) return null;

  routes.sort((a, b) => (a.amountIn.lt(b.amountIn) ? -1 : 1));
  return routes[0];
}

/**
 * Execute a route from `quoteDhbPurchase`, buying exactly `amountOutDhb`.
 *
 * `maxAmountIn` is the slippage-padded ceiling, not the spend: the router pulls
 * only what the trade costs, and native ETH is refunded in the same
 * transaction. `tokenContract` is the AA-aware ERC20 for the input token and is
 * only needed for a `path` route, which has to approve the router first.
 */
export async function buyDhbViaRoute(params: {
  routerContract: any;
  tokenContract?: any;
  route: DhbBuyRoute;
  amountOutDhb: ethers.BigNumber;
  maxAmountIn: ethers.BigNumber;
  recipient: string;
}): Promise<{ hash?: string }> {
  const { routerContract, tokenContract, route, amountOutDhb, maxAmountIn, recipient } = params;

  if (route.kind === "single") {
    return swapETHForDHB({
      routerContract,
      amountOutDHB: amountOutDhb,
      maxETH: maxAmountIn,
      recipient,
      feeTier: route.feeTier,
    });
  }

  if (!tokenContract) throw new Error("Token contract is required to swap an ERC20");

  const allowance = await tokenContract.allowance(recipient, UNISWAP_SWAP_ROUTER);
  if (ethers.BigNumber.from(allowance).lt(maxAmountIn)) {
    const approval = await writeContractAA(
      tokenContract,
      "approve",
      [UNISWAP_SWAP_ROUTER, maxAmountIn],
      { context: "approve" },
    );
    await approval.wait?.(1);
  }

  const deadline = ethers.BigNumber.from(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);
  const swapCalldata = routerContract.interface.encodeFunctionData("exactOutput", [
    {
      path: route.path,
      recipient,
      amountOut: amountOutDhb,
      amountInMaximum: maxAmountIn,
    },
  ]);

  const res = await writeContractAA(
    routerContract,
    "multicall",
    [deadline, [swapCalldata]],
    { context: "swap" },
  );
  await res.wait?.(1);
  return { hash: res.hash };
}
