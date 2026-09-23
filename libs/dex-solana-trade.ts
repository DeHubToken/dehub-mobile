/**
 * Trading a community pool on Solana, through Jupiter.
 *
 * Instant buys and sells are Jupiter swaps (best route across every Solana
 * DEX). Limit orders are Jupiter trigger orders: the maker's tokens sit in an
 * on-chain order account until Jupiter's keepers fill it at the asked price or
 * the maker cancels. Both APIs hand back an unsigned transaction; the DeHub
 * wallet signs it with its derived Solana key (services/solana.service.ts).
 *
 * Every order is priced against USDC, so a pool on Solana reads in dollars
 * exactly like one on an EVM chain.
 */
import { VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { getSolanaRpcUrl } from '../config/solana.constants';
import { getSolanaAddress, getSolanaKeypair } from '../services/solana.service';
import { readWithTimeout } from './dex-read-timeout';

const JUP = 'https://lite-api.jup.ag';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
/** Jupiter refuses trigger orders under this. */
export const MIN_ORDER_USD = 5;
/** SOL kept back from a max spend for fees and rent. */
const SOL_RESERVE = 0.01;

/** The Solana address that trades for the signed-in DeHub wallet. */
export async function solanaTrader(): Promise<string> {
  const address = await getSolanaAddress();
  if (!address) throw new Error('Solana wallet unavailable. Sign in again to trade on Solana.');
  return address;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await readWithTimeout(fetch(getSolanaRpcUrl(), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }), 'Solana RPC', 15000);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Solana RPC error');
  return json.result as T;
}

/** Whole-unit balance of a mint (SOL for the native mint). */
export async function solanaBalance(owner: string, mint: string): Promise<number> {
  if (mint === SOL_MINT) return (await rpc<{ value: number }>('getBalance', [owner])).value / 1e9;
  const result = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] }>(
    'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  return result.value.reduce((sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
}

export const spendableSol = (balance: number) => Math.max(0, balance - SOL_RESERVE);

async function jup<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await readWithTimeout(fetch(`${JUP}${path}`, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined }), 'Jupiter', 20000);
  const json = await res.json().catch(() => null) as (T & { error?: string; message?: string; code?: number }) | null;
  if (!res.ok || !json || json.error || (typeof json.code === 'number' && json.code !== 0)) {
    throw new Error(json?.error || json?.message || 'Jupiter could not route this right now');
  }
  return json;
}

async function sign(base64: string): Promise<{ signature: string; serialized: string }> {
  const tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
  tx.sign([await getSolanaKeypair()]);
  return { signature: ethers.utils.base58.encode(tx.signatures[0]), serialized: Buffer.from(tx.serialize()).toString('base64') };
}

async function confirm(signature: string) {
  for (let i = 0; i < 40; i++) {
    const { value } = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>('getSignatureStatuses', [[signature]]);
    const status = value[0];
    if (status?.err) throw new Error('The transaction failed on chain. Nothing was spent beyond the network fee.');
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('The transaction was sent but has not confirmed yet. Check your wallet before retrying.');
}

// ── Instant swaps ─────────────────────────────────────────────────────────

export interface SolanaQuote {
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
  minOut: bigint;
  priceImpactPct: number;
  usdValue: number | null;
  raw: Record<string, unknown>;
}

export async function quoteSolanaSwap(inputMint: string, outputMint: string, amount: bigint, slippageBps = 100): Promise<SolanaQuote> {
  if (amount <= 0n) throw new Error('Enter an amount');
  const params = `inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount.toString()}&slippageBps=${slippageBps}`;
  const raw = await jup<Record<string, unknown> & { inAmount: string; outAmount: string; otherAmountThreshold: string; priceImpactPct?: string; swapUsdValue?: string }>(`/swap/v1/quote?${params}`);
  return {
    inputMint, outputMint, inAmount: BigInt(raw.inAmount), outAmount: BigInt(raw.outAmount), minOut: BigInt(raw.otherAmountThreshold),
    priceImpactPct: Number(raw.priceImpactPct ?? 0) * 100, usdValue: Number(raw.swapUsdValue) || null, raw,
  };
}

export async function runSolanaSwap(quote: SolanaQuote, trader: string): Promise<string> {
  const built = await jup<{ swapTransaction: string; simulationError?: unknown }>('/swap/v1/swap', {
    method: 'POST',
    body: JSON.stringify({ quoteResponse: quote.raw, userPublicKey: trader, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 'auto', wrapAndUnwrapSol: true }),
  });
  if (built.simulationError) throw new Error('This swap would fail right now. Try a smaller amount.');
  const { signature, serialized } = await sign(built.swapTransaction);
  await rpc<string>('sendTransaction', [serialized, { encoding: 'base64', skipPreflight: true, maxRetries: 3 }]);
  await confirm(signature);
  return signature;
}

// ── Limit (trigger) orders ────────────────────────────────────────────────

export interface SolanaOrderInput { trader: string; side: 'buy' | 'sell'; tokenMint: string; tokenDecimals: number; amount: number; price: number }

/** Place a limit order: sells ask USDC for the token, buys offer USDC for it. Returns the order account and signature. */
export async function placeSolanaOrder(input: SolanaOrderInput): Promise<{ order: string; signature: string }> {
  const usd = input.side === 'sell' ? input.amount * input.price : input.amount;
  if (!(input.price > 0) || !(input.amount > 0)) throw new Error('Enter a valid amount and price');
  if (usd < MIN_ORDER_USD) throw new Error(`Solana limit orders must be worth at least $${MIN_ORDER_USD}`);
  const units = (value: number, decimals: number) => BigInt(Math.floor(value * 10 ** Math.min(decimals, 9))) * 10n ** BigInt(Math.max(0, decimals - 9));
  const [inputMint, outputMint, making, taking] = input.side === 'sell'
    ? [input.tokenMint, USDC_MINT, units(input.amount, input.tokenDecimals), units(usd, 6)]
    : [USDC_MINT, input.tokenMint, units(input.amount, 6), units(input.amount / input.price, input.tokenDecimals)];
  if (making <= 0n || taking <= 0n) throw new Error('Amount is too small');
  const created = await jup<{ order: string; transaction: string; requestId: string }>('/trigger/v1/createOrder', {
    method: 'POST',
    body: JSON.stringify({ inputMint, outputMint, maker: input.trader, payer: input.trader, computeUnitPrice: 'auto', wrapAndUnwrapSol: true,
      params: { makingAmount: making.toString(), takingAmount: taking.toString() } }),
  });
  const { signature, serialized } = await sign(created.transaction);
  await jup('/trigger/v1/execute', { method: 'POST', body: JSON.stringify({ signedTransaction: serialized, requestId: created.requestId }) });
  await confirm(signature);
  return { order: created.order, signature };
}

export async function cancelSolanaOrder(trader: string, order: string): Promise<string> {
  const built = await jup<{ transaction: string; requestId: string }>('/trigger/v1/cancelOrder', {
    method: 'POST', body: JSON.stringify({ maker: trader, order, computeUnitPrice: 'auto' }),
  });
  const { signature, serialized } = await sign(built.transaction);
  await jup('/trigger/v1/execute', { method: 'POST', body: JSON.stringify({ signedTransaction: serialized, requestId: built.requestId }) });
  await confirm(signature);
  return signature;
}

export interface SolanaOpenOrder { orderKey: string; maker: string; inputMint: string; outputMint: string; remainingMaking: number; remainingTaking: number; making: number; taking: number }

/** Active trigger orders for each maker, keyed by order account. */
export async function activeSolanaOrders(makers: string[]): Promise<Map<string, SolanaOpenOrder>> {
  const found = new Map<string, SolanaOpenOrder>();
  await Promise.all([...new Set(makers)].slice(0, 25).map(async (maker) => {
    try {
      const result = await jup<{ orders: Record<string, string>[] }>(`/trigger/v1/getTriggerOrders?user=${maker}&orderStatus=active`);
      for (const o of result.orders ?? []) {
        found.set(o.orderKey, {
          orderKey: o.orderKey, maker, inputMint: o.inputMint, outputMint: o.outputMint,
          making: Number(o.makingAmount), taking: Number(o.takingAmount),
          remainingMaking: Number(o.remainingMakingAmount ?? o.makingAmount), remainingTaking: Number(o.remainingTakingAmount ?? o.takingAmount),
        });
      }
    } catch { /* one maker's lookup failing leaves the rest of the book intact */ }
  }));
  return found;
}
