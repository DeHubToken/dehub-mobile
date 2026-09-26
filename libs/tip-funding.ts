/**
 * Paying for anything in DHB with whatever the payer holds, on whichever
 * chain it is. Mirror of web's src/lib/tip-funding.ts. Used by tips, live
 * gifts, pay-per-view and subscriptions.
 *
 * Payments still settle in DHB on Base through the usual contracts, so
 * crediting is unchanged. Where the DHB comes from, in order:
 *
 *   1. DeHub Pay. A token DPay accepts directly (ETH/USDC/USDT on Base,
 *      Ethereum, BNB, Robinhood…) is paid to the DPay treasury and DPay sends
 *      the DHB from its own stock. The money stays with DeHub.
 *   2. deBridge → DeHub Pay. Anything else (USDC on Arc…) becomes an exact
 *      amount of USDC in the payer's Safe on Base, and that USDC pays DPay.
 *   3. Uniswap, as the fallback, when DPay is out of DHB or turns the order
 *      down: the Base USDC or token buys from the Uniswap v4 DHB/USDC pool.
 *
 * Signing: the source chain is usually not the app's active chain (Arc never
 * is), so a Safe signer is built for it on demand from the device key — the
 * same Safe address on every chain, as libs/arc-wallet.ts does for Arc. The
 * active chain is never switched, so the sheet's Base contracts stay valid.
 *
 * Every hop pays the payer's own address, so an interrupted flow leaves USDC
 * or DHB in their wallet, and the next attempt spends it as Base balance.
 */
import { ethers } from 'ethers';
import { ChainId, ROBINHOOD_TOKENS } from '../config/constants';
import env from '../config/env';
import { apiClient } from './api.client';
import { getLocalAccountDetails } from './wallets.local';
import { setupAAProvider } from './wallet-core/smart-account';
import { isSelfFundedGasInsufficientError, writeBatchAA } from './aa.write';
import { evmProvider, quoteSwap, runSwap, type SwapCall } from './dex-evm-swap';
import { readWithTimeout } from './dex-read-timeout';
import { cryptoPurchaseApi } from '../services/crypto-purchase.service';
import type { Purchase } from './crypto-purchase';

const DLN_API = 'https://dln.debridge.finance/v1.0';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const ZERO = '0x0000000000000000000000000000000000000000';
/** Kyber source ids for the Uniswap pools, v4 first — that is where the DHB/USDC LP lives. */
const UNISWAP_SOURCES = 'uniswap-v4,uniswapv3,uniswap';
const DHB_BUFFER_BPS = 100n;
const USDC_BUFFER_BPS = 150n;
/** DPay holds back 0.5% of a sale and sends it as gas, so ask for a touch more DHB. */
const DPAY_DELIVERED_SHARE = 0.995;
const NATIVE_GAS_RESERVE: Record<number, bigint> = { [ChainId.ARC_MAINNET]: 10n ** 17n };
const FILL_TIMEOUT_MS = 15 * 60_000;
const DPAY_DELIVERY_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 2_000;

export const TIP_CHAIN_NAMES: Record<number, string> = {
  [ChainId.BASE_MAINNET]: 'Base',
  [ChainId.ARC_MAINNET]: 'Arc',
  [ChainId.MAINNET]: 'Ethereum',
  [ChainId.BSC_MAINNET]: 'BNB Chain',
  [ChainId.ROBINHOOD_MAINNET]: 'Robinhood Chain',
};

/** What a payment can be funded from. Native coins use '0x0'. */
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

/** Tokens DPay takes straight into its treasury, by chain. 'native' is the gas coin. */
const DPAY_ACCEPTED: Record<number, string[]> = {
  [ChainId.BASE_MAINNET]: ['native', USDC_BASE, '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'],
  [ChainId.MAINNET]: ['native', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
  [ChainId.BSC_MAINNET]: ['native', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', '0x55d398326f99059fF775485246999027B3197955'],
  [ChainId.ROBINHOOD_MAINNET]: ['native', ROBINHOOD_TOKENS.USDC, '0xe246bc49b0598d7cd9f0ead48b885034f1254380'],
};

export interface TipFundingSource {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  usd: number;
}

export type TipFundingStage = 'quote' | 'approve' | 'bridge' | 'arriving' | 'pay' | 'delivering' | 'swap';

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

interface DpayQuote {
  originAsset: string;
  tokensToReceive: number;
  amountIn: bigint;
}

export type TipFundingPlan =
  | { kind: 'none' }
  | { kind: 'dpay'; source: TipFundingSource; dpay: DpayQuote; payAmount: bigint }
  | { kind: 'swap'; source: TipFundingSource; swap: SwapCall; payAmount: bigint }
  | { kind: 'bridge'; source: TipFundingSource; order: DlnOrder; payAmount: bigint; fillSeconds: number; via: 'dpay' | 'uniswap' };

type Call = { to: string; data: `0x${string}`; value?: ethers.BigNumber };

const ERC20 = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function transfer(address to,uint256 amount) returns (bool)',
  'function deposit() payable',
]);
const isNativeSource = (s: { address: string }) => s.address === '0x0' || s.address.toLowerCase() === ZERO;
const withBps = (x: bigint, bps: bigint) => x + (x * bps) / 10000n + 1n;
const toDhbWei = (dhb: number) => BigInt(Math.ceil(dhb * 1e6)) * 10n ** 12n;
const big = (v: ethers.BigNumber) => BigInt(v.toString());
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const requestId = () => `pay_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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
    await sleep(1500);
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

/* ── Uniswap (fallback) ───────────────────────────────────────────── */

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
  throw new Error('There is not enough Uniswap liquidity for a payment this size right now');
}

/* ── Signing ──────────────────────────────────────────────────────── */

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

async function sendFromSafe(chainId: number, wallet: string, calls: Call[], context: string): Promise<string> {
  const safe = await safeOn(chainId, wallet);
  try {
    return (await writeBatchAA(safe, calls, { context, sponsored: false })).hash;
  } catch (error) {
    if (!isSelfFundedGasInsufficientError(error)) throw error;
    return (await writeBatchAA(safe, calls, { context })).hash;
  }
}

/* ── DeHub Pay ────────────────────────────────────────────────────── */

/** DPay's asset id for a token it accepts straight into its treasury, or null. */
function dpayAssetId(source: { chainId: number; address: string }): string | null {
  const list = DPAY_ACCEPTED[source.chainId];
  if (!list) return null;
  if (isNativeSource(source)) return `direct:${source.chainId}:native`;
  const hit = list.find(a => a.toLowerCase() === source.address.toLowerCase());
  return hit ? `direct:${source.chainId}:${hit.toLowerCase()}` : null;
}

const dpayTokensFor = (shortfallWei: bigint) =>
  Math.ceil(Number(ethers.utils.formatUnits(shortfallWei.toString(), 18)) / DPAY_DELIVERED_SHARE) + 1;

/** Price DHB from DPay in `originAsset`. Null when DPay cannot sell it right now. */
async function quoteDpay(originAsset: string, tokensToReceive: number, decimals: number, wallet: string): Promise<DpayQuote | null> {
  try {
    const [stock, quote] = await Promise.all([
      apiClient.get<{ balance?: Record<string, { DHB?: number }> }>('/dpay/available/tokens'),
      cryptoPurchaseApi.quote({ originAsset, tokensToReceive, address: wallet }) as Promise<{ amountIn?: string; paymentDecimals?: number }>,
    ]);
    if (Number(stock?.balance?.[ChainId.BASE_MAINNET]?.DHB ?? 0) < tokensToReceive || !quote.amountIn) return null;
    // Decimals that disagree with the chain would misprice the payment by orders of magnitude.
    if (quote.paymentDecimals != null && quote.paymentDecimals !== decimals) return null;
    return { originAsset, tokensToReceive, amountIn: BigInt(quote.amountIn) };
  } catch {
    return null;
  }
}

function dpayPaymentCalls(p: Purchase): Call[] {
  if (p.paymentDecimals == null) throw new Error('DeHub Pay did not return a payment amount');
  const amount = ethers.utils.parseUnits(p.amountInFormatted, p.paymentDecimals);
  if (p.wrapNativePayment && p.paymentTokenAddress) {
    return [
      { to: p.paymentTokenAddress, data: ERC20.encodeFunctionData('deposit') as `0x${string}`, value: amount },
      { to: p.paymentTokenAddress, data: ERC20.encodeFunctionData('transfer', [p.depositAddress, amount]) as `0x${string}` },
    ];
  }
  return p.paymentTokenAddress
    ? [{ to: p.paymentTokenAddress, data: ERC20.encodeFunctionData('transfer', [p.depositAddress, amount]) as `0x${string}` }]
    : [{ to: p.depositAddress, data: '0x', value: amount }];
}

/**
 * Open a DPay purchase, pay the treasury, confirm, and wait for the DHB.
 * Throws DPAY_UNAVAILABLE before any money moves when DPay turns it down.
 */
async function buyFromDpay(originAsset: string, tokensToReceive: number, chainId: number, wallet: string, needed: bigint, stage: (s: TipFundingStage) => void): Promise<void> {
  let purchase: Purchase;
  try {
    purchase = await cryptoPurchaseApi.create({
      originAsset, tokensToReceive, refundTo: wallet, receiverAddress: wallet,
      termsAndServicesAccepted: true, requestId: requestId(),
    });
  } catch {
    throw new Error('DPAY_UNAVAILABLE');
  }
  if (purchase.paymentChainId !== chainId || purchase.refundTo?.toLowerCase() !== wallet.toLowerCase()) throw new Error('DPAY_UNAVAILABLE');

  stage('pay');
  const txHash = await sendFromSafe(chainId, wallet, dpayPaymentCalls(purchase), 'DeHub Pay payment');

  // From here the treasury has the money; failures are delays, never refunds to chase.
  stage('delivering');
  const started = Date.now();
  let status: Purchase | null = cryptoPurchaseApi.confirm
    ? await cryptoPurchaseApi.confirm(purchase.id, txHash).catch(() => null)
    : null;
  while (status?.tokenSendStatus !== 'sent' && Date.now() - started < DPAY_DELIVERY_TIMEOUT_MS) {
    await sleep(POLL_MS * 2);
    status = await cryptoPurchaseApi.status(purchase.id).catch(() => status);
  }
  const dhb = await waitForBalance(ChainId.BASE_MAINNET, DHB_BASE, wallet, needed, 10);
  if (dhb < needed) {
    throw new Error('DeHub Pay has your payment and is sending the DHB. It will arrive in your wallet shortly; send again once it does.');
  }
}

/* ── deBridge ─────────────────────────────────────────────────────── */

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

async function waitForFill(orderId: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < FILL_TIMEOUT_MS) {
    const status = await dln<{ status?: string }>(`/dln/order/${orderId}/status`).then(r => r.status).catch(() => undefined);
    if (status === 'Fulfilled' || status === 'SentUnlock' || status === 'ClaimedUnlock') return;
    if (status && /cancel/i.test(status)) throw new Error('The cross-chain order was cancelled and refunded to your wallet');
    await sleep(POLL_MS);
  }
  throw new Error('The cross-chain transfer is taking longer than usual. It will arrive in your wallet on Base; send again once it does.');
}

/* ── Planning ─────────────────────────────────────────────────────── */

/** Price a payment of `amountDhb` from `source`. Only the gap over `dhbOnBase` is bought. */
export async function planTipFunding(input: { source: TipFundingSource; amountDhb: number; dhbOnBase: bigint; walletAddress: string }): Promise<TipFundingPlan> {
  const { source, walletAddress } = input;
  const needed = toDhbWei(input.amountDhb);
  if (input.dhbOnBase >= needed) return { kind: 'none' };
  const shortfall = needed - input.dhbOnBase;
  const reserve = NATIVE_GAS_RESERVE[source.chainId] ?? 0n;

  // 1. Straight to DeHub Pay.
  const assetId = dpayAssetId(source);
  if (assetId) {
    const dpay = await quoteDpay(assetId, dpayTokensFor(shortfall), source.decimals, walletAddress);
    if (dpay && dpay.amountIn + (isNativeSource(source) ? reserve : 0n) <= source.balance) {
      return { kind: 'dpay', source, dpay, payAmount: dpay.amountIn };
    }
  }

  // 3a. A Base token DPay does not take goes through Uniswap directly.
  const dhbOut = withBps(shortfall, DHB_BUFFER_BPS);
  if (source.chainId === ChainId.BASE_MAINNET) {
    const swap = await sizeDhbBuy(source.address, source.balance / 20n || 1n, dhbOut, walletAddress);
    if (swap.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} on Base for this payment`);
    return { kind: 'swap', source, swap, payAmount: swap.amountIn };
  }

  // 2 / 3b. Bridge exactly the USDC that DPay (or failing that, Uniswap) needs.
  const dpayUsdc = await quoteDpay(`direct:${ChainId.BASE_MAINNET}:${USDC_BASE.toLowerCase()}`, dpayTokensFor(shortfall), 6, walletAddress);
  const usdcNeeded = dpayUsdc ? dpayUsdc.amountIn : (await sizeDhbBuy(USDC_BASE, 10_000_000n, dhbOut, walletAddress)).amountIn;
  const order = await createDlnOrder(source, withBps(usdcNeeded, USDC_BUFFER_BPS), walletAddress);
  if (isNativeSource(source)) {
    if (order.value + reserve > source.balance) throw new Error(`Not enough ${source.symbol} for this payment, including network fees`);
  } else {
    if (order.amountIn > source.balance) throw new Error(`Not enough ${source.symbol} for this payment`);
    if (order.value + reserve > await tokenBalance(source.chainId, '0x0', walletAddress)) {
      throw new Error('Not enough of the network coin to cover the cross-chain fee');
    }
  }
  return {
    kind: 'bridge', source, order, fillSeconds: order.fillSeconds, via: dpayUsdc ? 'dpay' : 'uniswap',
    payAmount: isNativeSource(source) ? order.value : order.amountIn,
  };
}

/* ── Running ──────────────────────────────────────────────────────── */

/** USDC already on Base → DHB: DPay first, Uniswap if DPay cannot take it. */
async function spendBaseUsdc(usdc: bigint, wallet: string, needed: bigint, dhbOnBase: bigint, stage: (s: TipFundingStage) => void): Promise<void> {
  const tokens = dpayTokensFor(needed - dhbOnBase);
  const dpay = await quoteDpay(`direct:${ChainId.BASE_MAINNET}:${USDC_BASE.toLowerCase()}`, tokens, 6, wallet);
  if (dpay && dpay.amountIn <= usdc) {
    try {
      return await buyFromDpay(dpay.originAsset, tokens, ChainId.BASE_MAINNET, wallet, needed, stage);
    } catch (error) {
      if ((error as Error).message !== 'DPAY_UNAVAILABLE') throw error;
    }
  }
  const swap = await quoteUniswap(USDC_BASE, usdc, wallet);
  if (dhbOnBase + swap.minAmountOut < needed) {
    throw new Error('DHB moved while your USDC was arriving. The USDC is in your wallet on Base; send again to finish.');
  }
  stage('swap');
  await runSwap(swap, await safeOn(ChainId.BASE_MAINNET, wallet), wallet);
}

/**
 * Re-quote and run: leaves at least `amountDhb` DHB in the Safe on Base. The
 * caller then makes the payment as usual.
 */
export async function fundTip(input: { source: TipFundingSource; amountDhb: number; walletAddress: string; onStage?: (s: TipFundingStage) => void }): Promise<void> {
  const { source, walletAddress: wallet } = input;
  const stage = input.onStage ?? (() => {});
  stage('quote');
  const needed = toDhbWei(input.amountDhb);
  const dhbOnBase = await tokenBalance(ChainId.BASE_MAINNET, DHB_BASE, wallet);
  let plan = await planTipFunding({ source, amountDhb: input.amountDhb, dhbOnBase, walletAddress: wallet });
  if (plan.kind === 'none') return;

  if (plan.kind === 'dpay') {
    try {
      await buyFromDpay(plan.dpay.originAsset, plan.dpay.tokensToReceive, source.chainId, wallet, needed, stage);
      return;
    } catch (error) {
      if ((error as Error).message !== 'DPAY_UNAVAILABLE') throw error;
      // DPay turned the order down before any money moved: fall back to Uniswap.
      const dhbOut = withBps(needed - dhbOnBase, DHB_BUFFER_BPS);
      if (source.chainId === ChainId.BASE_MAINNET) {
        const swap = await sizeDhbBuy(source.address, source.balance / 20n || 1n, dhbOut, wallet);
        stage('swap');
        await runSwap(swap, await safeOn(ChainId.BASE_MAINNET, wallet), wallet);
        return;
      }
      const usdcSwap = await sizeDhbBuy(USDC_BASE, 10_000_000n, dhbOut, wallet);
      const order = await createDlnOrder(source, withBps(usdcSwap.amountIn, USDC_BUFFER_BPS), wallet);
      plan = {
        kind: 'bridge', source, order, fillSeconds: order.fillSeconds, via: 'uniswap',
        payAmount: isNativeSource(source) ? order.value : order.amountIn,
      };
    }
  }

  if (plan.kind === 'swap') {
    stage('swap');
    await runSwap(plan.swap, await safeOn(ChainId.BASE_MAINNET, wallet), wallet);
  } else if (plan.kind === 'bridge') {
    const { order } = plan;
    const calls: Call[] = [];
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
    stage('bridge');
    await sendFromSafe(source.chainId, wallet, calls, 'cross-chain payment');

    stage('arriving');
    await waitForFill(order.orderId);
    const usdc = await waitForBalance(ChainId.BASE_MAINNET, USDC_BASE, wallet, usdcBefore + order.usdcOut, 20);
    if (usdc < usdcBefore + order.usdcOut) throw new Error('Your USDC arrived on Base but is not visible yet. Send again in a moment.');
    await spendBaseUsdc(order.usdcOut, wallet, needed, dhbOnBase, stage);
  }

  const dhb = await waitForBalance(ChainId.BASE_MAINNET, DHB_BASE, wallet, needed, 10);
  if (dhb < needed) throw new Error('The DHB purchase confirmed but has not shown up yet. Send again in a moment.');
}

export function formatPayAmount(plan: TipFundingPlan): string | null {
  if (plan.kind === 'none') return null;
  const n = Number(ethers.utils.formatUnits(plan.payAmount.toString(), plan.source.decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 });
}

/** Whether a plan buys from DeHub Pay (true) or the Uniswap pool (false). */
export function planUsesDpay(plan: TipFundingPlan): boolean {
  return plan.kind === 'dpay' || (plan.kind === 'bridge' && plan.via === 'dpay');
}
