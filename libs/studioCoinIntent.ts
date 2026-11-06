/**
 * Studio balance top-ups in any coin NEAR Intents carries (BTC, SOL, DOGE,
 * Tron, every EVM chain...). The payer sends to a one-time address, the swap
 * lands as USDC on Base, and the API adds those dollars to the Studio balance.
 * Matches the website's lib/studio-coin-intent.ts.
 */
import { apiClient } from './api.client';
import { EVM_PAYMENT_CHAINS } from './crypto-purchase';

export interface AnyCoin {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price?: number;
  contractAddress?: string;
}

export interface AnyCoinQuote {
  amountInFormatted: string | null;
  amountInUsd: string | null;
  timeEstimateSeconds: number | null;
  usd: number;
  raisedToMinimum: boolean;
}

export interface AnyCoinIntent {
  id: string;
  originAsset: string;
  originSymbol: string;
  originBlockchain: string;
  depositAddress: string;
  depositMemo?: string | null;
  amountInFormatted: string;
  timeEstimateSeconds?: number;
  refundTo: string;
  usd: number;
  expiresAt: number;
  settlement: string;
  credited: boolean;
  creditedUsd?: number;
}

/** Smallest payment the API takes, in dollars. */
export const ANY_COIN_MIN_USD = 1;

/** Coins most people hold, shown first before anyone searches. */
const FEATURED: Array<[string, string]> = [
  ['BTC', 'btc'], ['SOL', 'sol'], ['ETH', 'eth'], ['USDC', 'sol'], ['USDT', 'tron'],
  ['ETH', 'arb'], ['DOGE', 'doge'], ['XRP', 'xrp'], ['TRX', 'tron'], ['LTC', 'ltc'],
  ['NEAR', 'near'], ['USDT', 'eth'], ['USDC', 'eth'], ['POL', 'pol'], ['AVAX', 'avax'],
];

export function sortAnyCoins(coins: AnyCoin[]): AnyCoin[] {
  const rank = (c: AnyCoin) => {
    const i = FEATURED.findIndex(([s, b]) => s === c.symbol && b === c.blockchain);
    return i === -1 ? FEATURED.length : i;
  };
  return [...coins].sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
}

export const isEvmCoin = (coin: { blockchain: string }) => EVM_PAYMENT_CHAINS.has(coin.blockchain);

/** Open, or still swapping: worth showing again when the sheet reopens. */
export function intentInFlight(intent: AnyCoinIntent, now = Date.now()): boolean {
  if (intent.credited) return false;
  if (['REFUNDED', 'FAILED', 'EXPIRED'].includes(intent.settlement)) return false;
  if (intent.settlement === 'PENDING_DEPOSIT' && intent.expiresAt * 1000 <= now) return false;
  return true;
}

export async function fetchAnyCoins(): Promise<AnyCoin[]> {
  const res = await apiClient.get<{ tokens?: AnyCoin[] }>('/subscription-credits/coin-options', { isAuthRequired: false });
  return sortAnyCoins(res?.tokens || []);
}

export function quoteAnyCoin(originAsset: string, usd: number): Promise<AnyCoinQuote> {
  return apiClient.post('/subscription-credits/coin-quote', { originAsset, usd }, { isAuthRequired: false });
}

export function openAnyCoinIntent(originAsset: string, usd: number, refundTo: string): Promise<AnyCoinIntent> {
  return apiClient.post('/subscription-credits/coin-intent', { originAsset, usd, refundTo });
}

export function anyCoinIntentStatus(id: string): Promise<AnyCoinIntent> {
  return apiClient.get(`/subscription-credits/coin-intent/${encodeURIComponent(id)}`);
}

export async function listAnyCoinIntents(): Promise<AnyCoinIntent[]> {
  const res = await apiClient.get<{ intents?: AnyCoinIntent[] }>('/subscription-credits/coin-intents');
  return res?.intents || [];
}
