/**
 * Paying a DHB tip with whatever the tipper holds, on whichever chain it is.
 * Mirror of web's src/lib/tip-funding.ts.
 *
 * Tips still settle in DHB on Base through StreamController, so the creator is
 * credited exactly as before. What changes is where the DHB comes from:
 *
 *   1. Token on another chain (USDC on Arc, ETH on Ethereum, USDT on BNB…) →
 *      a deBridge order that delivers an EXACT amount of USDC to the tipper's
 *      own Safe on Base. Solvers fill from inventory, so it lands in seconds.
 *   2. USDC (or anything already on Base) → DHB through the Uniswap v4
 *      DHB/USDC pool, via the Kyber router the DEX screen already uses,
 *      pinned to Uniswap sources.
 *   3. The sheet then sends the tip exactly as a DHB holder would.
 *
 * Signing: the source chain is usually not the app's active chain (Arc never
 * is), so a Safe signer is built for it on demand from the device key — the
 * same Safe address on every chain, as libs/arc-wallet.ts does for Arc. The
 * active chain is never switched, so the sheet's Base contracts stay valid.
 *
 * Nothing here is custodial: every hop pays the tipper's own address, so an
 * interrupted flow leaves USDC or DHB in their wallet, and the next attempt
 * spends it as Base balance.
 */
import { ethers } from 'ethers';
import { ChainId, ROBINHOOD_TOKENS } from '../config/constants';
import env from '../config/env';
import { getLocalAccountDetails } from './wallets.local';
import { setupAAProvider } from './wallet-core/smart-account';
import { isSelfFundedGasInsufficientError, writeBatchAA } from './aa.write';
import { evmProvider, quoteSwap, runSwap, type SwapCall } from './dex-evm-swap';
import { readWithTimeout } from './dex-read-timeout';

const DLN_API = 'https://dln.debridge.finance/v1.0';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const ZERO = '0x0000000000000000000000000000000000000000';
/** Kyber source ids for the Uniswap pools, v4 first — that is where the DHB/USDC LP lives. */
const UNISWAP_SOURCES = 'uniswap-v4,uniswapv3,uniswap';
const DHB_BUFFER_BPS = 100n;
const USDC_BUFFER_BPS = 150n;
const NATIVE_GAS_RESERVE: Record<number, bigint> = { [ChainId.ARC_MAINNET]: 10n ** 17n };
const FILL_TIMEOUT_MS = 15 * 60_000;
const FILL_POLL_MS = 2_000;

export const TIP_CHAIN_NAMES: Record<number, string> = {
  [ChainId.BASE_MAINNET]: 'Base',
  [ChainId.ARC_MAINNET]: 'Arc',
  [ChainId.MAINNET]: 'Ethereum',
  [ChainId.BSC_MAINNET]: 'BNB Chain',
  [ChainId.ROBINHOOD_MAINNET]: 'Robinhood Chain',
};

/** What a tip can be paid from. Native coins use '0x0'. */
const SOURCE_TOKENS: { chainId: number; address: string; symbol: string; decimals: number; stable?: boolean }[] = [
  { chainId: ChainId.BASE_MAINNET, address: USDC_BASE, symbol: 'USDC', decimals: 6, stable: true },
  { chainId: ChainId.BASE_MAINNET, address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', decimals: 6, stable: true },
  { chainId: ChainId.BASE_MAINNET, address: '0x0', symbol: 'ETH', decimals: 18 },
  { chainId: ChainId.ARC_MAINNET, address: '0x0', symbol: 'USDC', decimals: 18, stable: true },
  { chainId: ChainId.MAINNET, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, stable: true },
  { chainId: ChainId.MAINNET, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6, stable: true },
  { chainId: ChainId.MAINNET, address: '0x0', symbol: 'ETH', decimals: 18 },
  { chainId: ChainId.BSC_MAINNET, address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18, stable: true },
  { chainId: ChainId.BSC_MAINNET, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18, stable: true },
  { chainId: ChainId.BSC_MAINNET, address: '0x0', symbol: 'BNB', decimals: 18 },
  { chainId: ChainId.ROBINHOOD_MAINNET, address: ROBINHOOD_TOKENS.USDC, symbol: 'USDC', decimals: 6, stable: true },
  { chainId: ChainId.ROBINHOOD_MAINNET, address: '0x0', symbol: 'ETH', decimals: 18 },
];
const MIN_SOURCE_USD = 0.5;

export interface TipFundingSource {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  usd: number;
}

export type TipFundingStage = 'quote' | 'approve' | 'bridge' | 'arriving' | 'swap';

interface DlnOrder {
  orderId: string;
  to: string;
  data: string;
  value: bigint;
  allowanceTarget?: string;
  amountIn: bigint;
  usdcOut: bigint;
  fillSeconds: number;
}

export type TipFundingPlan =
  | { kind: 'none' }
  | { kind: 'swap'; source: TipFundingSource; swap: SwapCall; payAmount: bigint }
  | { kind: 'bridge'; source: TipFundingSource; order: DlnOrder; payAmount: bigint; fillSeconds: number };

const ERC20 = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);
const isNativeSource = (s: { address: string }) => s.address === '0x0' || s.address.toLowerCase() === ZERO;
const withBps = (x: bigint, bps: bigint) => x + (x * bps) / 10000n + 1n;
const toDhbWei = (dhb: number) => BigInt(Math.ceil(dhb * 1e6)) * 10n ** 12n;
const big = (v: ethers.BigNumber) => BigInt(v.toString());

async function tokenBalance(chainId: number, token: string, owner: string): Promise<bigint> {
  const provider = evmProvider(chainId);
  const raw = isNativeSource({ address: token })
    ? await readWithTimeout(provider.getBalance(owner), 'Balance')
    : await readWithTimeout(new ethers.Contract(token, ERC20, provider).balanceOf(owner) as Promise<ethers.BigNumber>, 'Balance');
  return big(raw);
}

async function waitForBalance(chainId: number, token: string, owner: string, atLeast: bigint, attempts: number): Promise<bigint> {
  let balance = 0n;
  for (let i = 0; i < attempts; i++) {
    balance = await tokenBalance(chainId, token, owner).catch(() => balance);
    if (balance >= atLeast) return balance;
    await new Promise(r => setTimeout(r, 1500));
  }
  return balance;
}

async function prices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/get-dhb-price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return (await res.json())?.prices ?? {};
  } catch { return {}; }
}

/** DHB on Base, and every balance worth offering as a way to pay, richest first. */
export async function loadTipSources(owner: string): Promise<{ dhbOnBase: bigint; sources: TipFundingSource[] }> {
  const [priceMap, dhbOnBase, balances] = await Promise.all([
    prices(),
    tokenBalance(ChainId.BASE_MAINNET, DHB_BASE, owner).catch(() => 0n),
    Promise.all(SOURCE_TOKENS.map(tk => tokenBalance(tk.chainId, tk.address, owner).catch(() => 0n))),
  ]);
  const sources = SOURCE_TOKENS.map((tk, i) => {
    const balance = balances[i];
    const price = tk.stable ? 1 : Number(priceMap[tk.symbol] ?? 0);
    return { chainId: tk.chainId, address: tk.address, symbol: tk.symbol, decimals: tk.decimals, balance,
      usd: Number(ethers.utils.formatUnits(balance.toString(), tk.decimals)) * price };
  }).filter(s => s.usd >= MIN_SOURCE_USD).sort((a, b) => b.usd - a.usd);
  return { dhbOnBase, sources };
}

async function quoteUniswap(tokenIn: string, amountIn: bigint, recipient: string): Promise<SwapCall> {
  const input = { chainId: ChainId.BASE_MAINNET, tokenIn, tokenOut: DHB_BASE, amountIn, recipient };
  try {
    return await quoteSwap({ ...input, sources: UNISWAP_SOURCES });
  } catch {
    return quoteSwap(input);
  }
}

/** Kyber quotes exact input only: probe the rate, size the input, correct for price impact. */
async function sizeDhbBuy(tokenIn: string, probeIn: bigint, dhbOut: bigint, recipient: string): Promise<SwapCall> {
  const probe = await quoteUniswap(tokenIn, probeIn, recipient);
  if (probe.minAmountOut <= 0n) throw new Error('No Uniswap route to DHB for this token right now');
  let amountIn = withBps((probeIn * dhbOut) / probe.minAmountOut, 30n);
  for (let attempt = 0; attempt < 4; attempt++) {
    const swap = await quoteUniswap(tokenIn, amountIn, recipient);
    if (swap.minAmountOut >= dhbOut) return swap;
    if (swap.minAmountOut <= 0n) break;
    amountIn = withBps((amountIn * dhbOut) / swap.minAmountOut, 30n);
  }
  throw new Error('There is not enough Uniswap liquidity for a tip this size right now');
}

async function dln<T>(path: string): Promise<T> {
  const res = await readWithTimeout(fetch(`${DLN_API}${path}`), 'Cross-chain quote', 20000);
  const json = await res.json().catch(() => null) as (T & { errorMessage?: string }) | null;
  if (!res.ok || !json || json.errorMessage) throw new Error(json?.errorMessage || 'No cross-chain route is available right now');
  return json;
}

async function createDlnOrder(source: TipFundingSource, usdcOut: bigint, wallet: string): Promise<DlnOrder> {
  const params = [
    ['srcChainId', String(source.chainId)],
    ['srcChainTokenIn', isNativeSource(source) ? ZERO : source.address],
    ['srcChainTokenInAmount', 'auto'],
    ['dstChainId', String(ChainId.BASE_MAINNET)],
    ['dstChainTokenOut', USDC_BASE],
    ['dstChainTokenOutAmount', usdcOut.toString()],
    ['dstChainTokenOutRecipient', wallet],
    ['srcChainOrderAuthorityAddress', wallet],
    ['dstChainOrderAuthorityAddress', wallet],
    ['senderAddress', wallet],
    ['prependOperatingExpenses', 'true'],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await dln<{
    orderId: string;
    estimation: { srcChainTokenIn: { amount: string }; dstChainTokenOut: { amount: string } };
    tx: { to?: string; data?: string; value?: string; allowanceTarget?: string };
    order?: { approximateFulfillmentDelay?: number };
  }>(`/dln/order/create-tx?${params}`);
  if (!res.tx?.to || !res.tx.data) throw new Error('No cross-chain route is available right now');
  return {
    orderId: res.orderId, to: res.tx.to, data: res.tx.data, value: BigInt(res.tx.value || '0'),
    allowanceTarget: res.tx.allowanceTarget,
    amountIn: BigInt(res.estimation.srcChainTokenIn.amount),
    usdcOut: BigInt(res.estimation.dstChainTokenOut.amount),
    fillSeconds: res.order?.approximateFulfillmentDelay ?? 10,
  };
}

/** Price a tip of `amountDhb` paid from `source`. Only the gap over `dhbOnBase` is bought. */
export async function planTipFunding(input: { source: TipFundingSource; amountDhb: number; dhbOnBase: bigint; walletAddress: string }): Promise<TipFundingPlan> {
  const { source, walletAddress } = input;
  const needed = toDhbWei(input.amountDhb);
  if (input.dhbOnBase >= needed) return { kind: 'none' };
  const dhbOut = withBps(needed - input.dhbOnBase, DHB_BUFFER_BPS);

  if (source.chainId === ChainId.BASE_MAINNET) {
    const swap = await sizeDhbBuy(source.address, source.balance / 20n || 1n, dhbOut, walletAddress);
    if (swap.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} on Base for this tip`);
    return { kind: 'swap', source, swap, payAmount: swap.amountIn };
  }

  const usdcSwap = await sizeDhbBuy(USDC_BASE, 10_000_000n, dhbOut, walletAddress);
  const order = await createDlnOrder(source, withBps(usdcSwap.amountIn, USDC_BUFFER_BPS), walletAddress);
  const reserve = NATIVE_GAS_RESERVE[source.chainId] ?? 0n;
  if (isNativeSource(source)) {
    if (order.value + reserve > source.balance) throw new Error(`Not enough ${source.symbol} for this tip, including network fees`);
  } else {
    if (order.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} for this tip`);
    if (order.value + reserve > await tokenBalance(source.chainId, '0x0', walletAddress)) {
      throw new Error('Not enough of the network coin to cover the cross-chain fee');
    }
  }
  return { kind: 'bridge', source, order, payAmount: isNativeSource(source) ? order.value : order.amountIn, fillSeconds: order.fillSeconds };
}

/** The session's Safe on `chainId`, built from the device key. Refuses anything but the session address. */
async function safeOn(chainId: number, sessionAddress: string): Promise<any> {
  const details = await getLocalAccountDetails(sessionAddress);
  if (!details?.privateKey) throw new Error('Unlock your wallet to pay with this token');
  const owner = new ethers.Wallet(details.privateKey).address;
  const safe = await setupAAProvider(owner, details.privateKey, chainId);
  const [from] = ((await safe?.request({ method: 'eth_accounts' })) as string[] | undefined) ?? [];
  if (!safe || from?.toLowerCase() !== sessionAddress.toLowerCase()) {
    throw new Error(`Paying from ${TIP_CHAIN_NAMES[chainId] ?? 'this network'} is not available for this wallet`);
  }
  return safe;
}

async function waitForFill(orderId: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < FILL_TIMEOUT_MS) {
    const status = await dln<{ status?: string }>(`/dln/order/${orderId}/status`).then(r => r.status).catch(() => undefined);
    if (status === 'Fulfilled' || status === 'SentUnlock' || status === 'ClaimedUnlock') return;
    if (status && /cancel/i.test(status)) throw new Error('The cross-chain order was cancelled and refunded to your wallet');
    await new Promise(r => setTimeout(r, FILL_POLL_MS));
  }
  throw new Error('The cross-chain transfer is taking longer than usual. It will arrive in your wallet on Base; send the tip again once it does.');
}

/**
 * Re-quote and run: leaves at least `amountDhb` DHB in the Safe on Base. The
 * caller sends the tip.
 */
export async function fundTip(input: { source: TipFundingSource; amountDhb: number; walletAddress: string; onStage?: (s: TipFundingStage) => void }): Promise<void> {
  const { source, walletAddress: wallet } = input;
  const stage = input.onStage ?? (() => {});
  stage('quote');
  const needed = toDhbWei(input.amountDhb);
  const dhbOnBase = await tokenBalance(ChainId.BASE_MAINNET, DHB_BASE, wallet);
  const plan = await planTipFunding({ source, amountDhb: input.amountDhb, dhbOnBase, walletAddress: wallet });
  if (plan.kind === 'none') return;

  let swap: SwapCall;
  if (plan.kind === 'swap') {
    swap = plan.swap;
  } else {
    const { order } = plan;
    const calls: { to: string; data: `0x${string}`; value?: ethers.BigNumber }[] = [];
    if (!isNativeSource(source) && order.allowanceTarget) {
      const allowance = big(await readWithTimeout(
        new ethers.Contract(source.address, ERC20, evmProvider(source.chainId)).allowance(wallet, order.allowanceTarget) as Promise<ethers.BigNumber>,
        'Token allowance'));
      if (allowance < order.amountIn) {
        calls.push({ to: source.address, data: ERC20.encodeFunctionData('approve', [order.allowanceTarget, order.amountIn.toString()]) as `0x${string}` });
      }
    }
    calls.push({ to: order.to, data: order.data as `0x${string}`, value: ethers.BigNumber.from(order.value.toString()) });
    const usdcBefore = await tokenBalance(ChainId.BASE_MAINNET, USDC_BASE, wallet);
    const safe = await safeOn(source.chainId, wallet);
    stage('bridge');
    try {
      await writeBatchAA(safe, calls, { context: 'cross-chain tip', sponsored: false });
    } catch (error) {
      if (!isSelfFundedGasInsufficientError(error)) throw error;
      await writeBatchAA(safe, calls, { context: 'cross-chain tip' });
    }

    stage('arriving');
    await waitForFill(order.orderId);
    const usdc = await waitForBalance(ChainId.BASE_MAINNET, USDC_BASE, wallet, usdcBefore + order.usdcOut, 20);
    if (usdc < usdcBefore + order.usdcOut) throw new Error('Your USDC arrived on Base but is not visible yet. Send the tip again in a moment.');
    swap = await quoteUniswap(USDC_BASE, order.usdcOut, wallet);
    if (dhbOnBase + swap.minAmountOut < needed) {
      throw new Error('DHB moved while your USDC was arriving. The USDC is in your wallet on Base; send the tip again to finish.');
    }
  }

  stage('swap');
  await runSwap(swap, await safeOn(ChainId.BASE_MAINNET, wallet), wallet);
  const dhb = await waitForBalance(ChainId.BASE_MAINNET, DHB_BASE, wallet, needed, 10);
  if (dhb < needed) throw new Error('The DHB purchase confirmed but has not shown up yet. Send the tip again in a moment.');
}

export function formatPayAmount(plan: TipFundingPlan): string | null {
  if (plan.kind === 'none') return null;
  const n = Number(ethers.utils.formatUnits(plan.payAmount.toString(), plan.source.decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 });
}
