/**
 * Funding a DHB buy order with whatever the wallet actually holds.
 *
 * The order book is a DHB/USDC pool, so every buy settles in USDC. A buyer
 * holding ETH should not have to know that: they see a dollar balance, type a
 * dollar amount, and get a USDC position. This module prices the wallet's
 * spendable Base assets in dollars, quotes the exact-output swap that turns
 * one of them into the USDC the order needs, and runs swap → approvals → mint.
 *
 * The built-in wallet is a Safe, so the whole sequence is one atomic,
 * sponsored user operation. External wallets sign each step; the swap's hash
 * is reported before the mint starts so a relaunch resumes at the mint.
 *
 * Only Base is funded this way: it is the canonical book and the only chain
 * with a deep ETH/USDC route. The BNB book takes BNB-chain USDC directly.
 */
import { ethers } from 'ethers';
import env from '../config/env';
import { ChainId } from '../config/constants';
import { writeBatchAA } from './aa.write';
import { dexProvider } from './dex-rpc';
import { DEX_CHAINS, mintSell, quoteSell, recoverMint, sendTx, type DexChainId, type SellInput } from './dex-v4';
import { readWithTimeout, type OrderStage } from './dex-read-timeout';

export const FUNDING_CHAIN = ChainId.BASE_MAINNET;
const USDC = DEX_CHAINS[ChainId.BASE_MAINNET].usdc;
const WETH = '0x4200000000000000000000000000000000000006';
const USDT = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
/** Room for the price to move between quote and execution. Unused input is refunded. */
const SLIPPAGE_BPS = 150n;
/** Kept back from a MAX spend so slippage never pushes the swap over the balance. */
const MAX_SPEND_RESERVE = 0.985;
const SWAP_DEADLINE_SECONDS = 120;

export type FundingSymbol = 'USDC' | 'ETH' | 'USDT';
export interface FundingAsset {
  symbol: FundingSymbol;
  /** '0x0' for native ETH. */
  address: string;
  decimals: number;
  balance: bigint;
  /** Dollar value of the whole balance. */
  usd: number;
  /** The most this asset can fund, in dollars of USDC, after the swap reserve. */
  spendableUsd: number;
  /** Swap fee tiers to try, cheapest first. Empty for USDC itself. */
  feeTiers: number[];
}
const ROUTES: Record<FundingSymbol, { address: string; decimals: number; feeTiers: number[] }> = {
  USDC: { address: USDC, decimals: 6, feeTiers: [] },
  ETH: { address: '0x0', decimals: 18, feeTiers: [500, 3000] },
  USDT: { address: USDT, decimals: 6, feeTiers: [100, 500] },
};
const ERC20 = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const QUOTER = new ethers.utils.Interface([
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
const ROUTER = new ethers.utils.Interface([
  'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
  'function refundETH() payable',
  'function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])',
]);
const PERMIT = new ethers.utils.Interface(['function approve(address token,address spender,uint160 amount,uint48 expiration)']);

/** ETH in dollars from the shared price endpoint. Zero when unreadable, which hides ETH as an option rather than mispricing it. */
async function ethUsd(): Promise<number> {
  try {
    const res = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/get-dhb-price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    const price = Number(data?.prices?.ETH);
    return Number.isFinite(price) && price > 0 ? price : 0;
  } catch { return 0; }
}

/** What the wallet can spend on a Base buy, in dollars: USDC first, then whatever is worth most. */
export async function loadFundingAssets(address: string): Promise<FundingAsset[]> {
  const provider = dexProvider(ChainId.BASE_MAINNET);
  const [eth, usdc, usdt, price] = await Promise.all([
    readWithTimeout(provider.getBalance(address), 'ETH balance').catch(() => ethers.constants.Zero),
    readWithTimeout(new ethers.Contract(USDC, ERC20, provider).balanceOf(address) as Promise<ethers.BigNumber>, 'USDC balance').catch(() => ethers.constants.Zero),
    readWithTimeout(new ethers.Contract(USDT, ERC20, provider).balanceOf(address) as Promise<ethers.BigNumber>, 'USDT balance').catch(() => ethers.constants.Zero),
    ethUsd(),
  ]);
  const build = (symbol: FundingSymbol, raw: ethers.BigNumber, unit: number): FundingAsset => {
    const route = ROUTES[symbol];
    const balance = BigInt(raw.toString());
    const usd = Number(ethers.utils.formatUnits(raw, route.decimals)) * unit;
    const spendableUsd = symbol === 'USDC' ? Math.floor(usd * 100) / 100 : Math.floor(usd * MAX_SPEND_RESERVE * 100) / 100;
    return { symbol, address: route.address, decimals: route.decimals, balance, usd, spendableUsd, feeTiers: route.feeTiers };
  };
  const assets = [build('USDC', usdc, 1), build('ETH', eth, price), build('USDT', usdt, 1)];
  return assets.sort((a, b) => (a.symbol === 'USDC' ? -1 : b.symbol === 'USDC' ? 1 : b.usd - a.usd));
}

/** The asset a fresh ticket should spend: USDC when it covers the bill, otherwise the richest one. */
export function defaultFundingAsset(assets: FundingAsset[], usdAmount = 0): FundingAsset | null {
  const usdc = assets.find((a) => a.symbol === 'USDC');
  if (usdc && (usdAmount <= 0 ? usdc.balance > 0n : usdc.spendableUsd >= usdAmount)) return usdc;
  const richest = [...assets].filter((a) => a.balance > 0n).sort((a, b) => b.spendableUsd - a.spendableUsd)[0];
  return richest ?? usdc ?? assets[0] ?? null;
}

export interface FundingQuote { asset: FundingAsset; usdcAmount: bigint; amountIn: bigint; maxAmountIn: bigint; feeTier: number | null }

/** Price the swap that lands exactly `usdcAmount` USDC from `asset`; the cheapest fee tier wins. */
export async function quoteFunding(asset: FundingAsset, usdcAmount: bigint): Promise<FundingQuote> {
  if (usdcAmount <= 0n) throw new Error('Enter an amount to spend');
  if (asset.symbol === 'USDC') {
    if (asset.balance < usdcAmount) throw new Error('Insufficient USDC on Base');
    return { asset, usdcAmount, amountIn: 0n, maxAmountIn: 0n, feeTier: null };
  }
  const tokenIn = asset.symbol === 'ETH' ? WETH : asset.address;
  const quoter = new ethers.Contract(QUOTER_V2, QUOTER, dexProvider(ChainId.BASE_MAINNET));
  const quotes = await Promise.all(asset.feeTiers.map(async (fee) => {
    try {
      const res = await quoter.callStatic.quoteExactOutputSingle({ tokenIn, tokenOut: USDC, amount: usdcAmount.toString(), fee, sqrtPriceLimitX96: 0 });
      const amountIn = BigInt((res.amountIn ?? res[0]).toString());
      return amountIn > 0n ? { amountIn, fee } : null;
    } catch { return null; }
  }));
  const best = quotes.filter((q): q is { amountIn: bigint; fee: number } => q !== null).sort((a, b) => (a.amountIn < b.amountIn ? -1 : 1))[0];
  if (!best) throw new Error(`No ${asset.symbol} → USDC route is available on Base right now`);
  const maxAmountIn = best.amountIn + best.amountIn * SLIPPAGE_BPS / 10000n;
  if (maxAmountIn > asset.balance) throw new Error(`Not enough ${asset.symbol} on Base to cover this order after slippage`);
  return { asset, usdcAmount, amountIn: best.amountIn, maxAmountIn, feeTier: best.fee };
}

/** The router call that buys exactly the USDC the order needs, refunding unused ETH in the same transaction. */
function swapCall(quote: FundingQuote, recipient: string): { to: string; data: `0x${string}`; value: bigint } {
  const native = quote.asset.symbol === 'ETH';
  const swap = ROUTER.encodeFunctionData('exactOutputSingle', [{
    tokenIn: native ? WETH : quote.asset.address, tokenOut: USDC, fee: quote.feeTier,
    recipient, amountOut: quote.usdcAmount.toString(), amountInMaximum: quote.maxAmountIn.toString(), sqrtPriceLimitX96: 0,
  }]);
  const calls = native ? [swap, ROUTER.encodeFunctionData('refundETH', [])] : [swap];
  const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS;
  return { to: SWAP_ROUTER, data: ROUTER.encodeFunctionData('multicall', [deadline, calls]) as `0x${string}`, value: native ? quote.maxAmountIn : 0n };
}

export type FundingStage = OrderStage | 'swap' | 'swapConfirm';
export interface FundedOrder { input: SellInput; quote: FundingQuote }
/** Progress a resumable external-wallet flow has already made. */
export interface FundingProgress { swapTxHash?: string }

async function fundAndMintBatched(order: FundedOrder, signingProvider: any, progress: (stage: FundingStage) => void) {
  const { input, quote } = order;
  const cfg = DEX_CHAINS[ChainId.BASE_MAINNET];
  progress('quote');
  const position = await quoteSell(input);
  if (position.amountWei > quote.usdcAmount) throw new Error('The position would require more USDC than the swap delivers');
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const calls: { to: string; data: `0x${string}`; value?: ethers.BigNumber }[] = [];
  if (quote.asset.symbol !== 'USDC') {
    if (quote.asset.symbol !== 'ETH') calls.push({ to: quote.asset.address, data: ERC20.encodeFunctionData('approve', [SWAP_ROUTER, quote.maxAmountIn.toString()]) as `0x${string}` });
    const swap = swapCall(quote, input.walletAddress);
    calls.push({ to: swap.to, data: swap.data, value: ethers.BigNumber.from(swap.value.toString()) });
  }
  // Approvals ride along unconditionally: they are cheap inside the batch and
  // the balance they cover only exists after the swap call before them.
  calls.push({ to: USDC, data: ERC20.encodeFunctionData('approve', [PERMIT2, position.amountWei.toString()]) as `0x${string}` });
  calls.push({ to: PERMIT2, data: PERMIT.encodeFunctionData('approve', [USDC, cfg.manager, position.amountWei.toString(), expires]) as `0x${string}` });
  calls.push({ to: cfg.manager, data: position.calldata as `0x${string}`, value: ethers.BigNumber.from(position.value) });
  progress('submit');
  const tx = await writeBatchAA(signingProvider, calls, { context: 'fund and create DHB buy order' });
  progress('confirm');
  return recoverMint(input, tx.hash);
}

/** A confirmed swap is not yet a visible balance on a load-balanced RPC. */
async function waitForUsdc(address: string, atLeast: bigint): Promise<bigint> {
  const token = new ethers.Contract(USDC, ERC20, dexProvider(ChainId.BASE_MAINNET));
  let balance = 0n;
  for (let attempt = 0; attempt < 10; attempt++) {
    balance = await (token.balanceOf(address) as Promise<ethers.BigNumber>).then((b) => BigInt(b.toString())).catch(() => balance);
    if (balance >= atLeast) return balance;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return balance;
}

async function fundAndMintSequential(order: FundedOrder, signingProvider: any, progress: (stage: FundingStage) => void,
  swapped: (hash: string) => void, submitted: (hash: string) => void, resume?: FundingProgress) {
  const { input, quote } = order;
  const chainId: DexChainId = ChainId.BASE_MAINNET;
  if (quote.asset.symbol !== 'USDC' && !resume?.swapTxHash) {
    if (quote.asset.symbol !== 'ETH') {
      const token = new ethers.Contract(quote.asset.address, ERC20, dexProvider(ChainId.BASE_MAINNET));
      const allowance = BigInt(((await token.allowance(input.walletAddress, SWAP_ROUTER)) as ethers.BigNumber).toString());
      if (allowance < quote.maxAmountIn) {
        progress('tokenApproval');
        await sendTx(signingProvider, chainId, input.walletAddress, quote.asset.address, ERC20.encodeFunctionData('approve', [SWAP_ROUTER, quote.maxAmountIn.toString()]));
      }
    }
    progress('swap');
    const swap = swapCall(quote, input.walletAddress);
    await sendTx(signingProvider, chainId, input.walletAddress, swap.to, swap.data, ethers.BigNumber.from(swap.value.toString()).toHexString(), (hash) => { swapped(hash); progress('swapConfirm'); });
  }
  if (quote.asset.symbol !== 'USDC') {
    const balance = await waitForUsdc(input.walletAddress, quote.usdcAmount);
    if (balance < quote.usdcAmount) throw new Error('The swap confirmed but the USDC has not shown up yet. Resume in a moment.');
  }
  return mintSell(input, signingProvider, progress, submitted);
}

/** Fund the order from `quote.asset` and mint it: one batch for the built-in wallet, signed steps otherwise. */
export async function fundAndMint(order: FundedOrder, signingProvider: any, handlers: {
  progress?: (stage: FundingStage) => void; swapped?: (hash: string) => void; submitted?: (hash: string) => void; resume?: FundingProgress;
} = {}): Promise<{ tokenId: string; txHash: string }> {
  const progress = handlers.progress ?? (() => {});
  if (!handlers.resume?.swapTxHash) {
    try { return await fundAndMintBatched(order, signingProvider, progress); }
    catch (error) { if ((error as Error).message !== 'BATCH_UNSUPPORTED') throw error; }
  }
  return fundAndMintSequential(order, signingProvider, progress, handlers.swapped ?? (() => {}), handlers.submitted ?? (() => {}), handlers.resume);
}

/** A dollar amount typed on the ticket, as the order input string and USDC base units. */
export function usdcAmountFor(usd: string): { amount: string; units: bigint } | null {
  if (!/^\d+(\.\d{1,6})?$/.test(usd)) return null;
  const units = BigInt(ethers.utils.parseUnits(usd, 6).toString());
  return units > 0n ? { amount: usd, units } : null;
}
