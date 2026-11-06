/**
 * Pay for AI generation with USDT or USDC when DHB runs short.
 *
 * Prices stay in DHB. The coin is sent to the treasury, the API reads it on
 * chain and adds it to the Studio balance in dollars, and the job is then paid
 * from that balance — the route payForJob already takes first. Matches the
 * website's lib/coin-topup.ts.
 *
 * The app offers the dollar coins only: they send the same way from every
 * wallet the app holds, smart accounts included. BNB, ETH and USDFC are on the
 * website for now.
 */
import { apiClient } from './api.client';
import {
  claimSubscriptionCreditTopUp,
  clearPendingCreditTopUp,
  FINAL_TOPUP_STATUSES,
  rememberPendingCreditTopUp,
} from '../services/credits.service';

export interface TopUpCoin {
  symbol: 'USDT' | 'USDC';
  chainId: number;
  address: string;
  decimals: number;
  priceUsd: number;
  treasuryAddress: string;
}

export const COIN_CHAIN_NAMES: Record<number, string> = { 56: 'BNB Chain', 8453: 'Base' };

const READ_RPCS: Record<number, string[]> = {
  56: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
  8453: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
};

export const coinKey = (c: Pick<TopUpCoin, 'symbol' | 'chainId'>) => `${c.symbol}:${c.chainId}`;

export async function fetchTopUpCoins(): Promise<TopUpCoin[]> {
  const res = await apiClient.get<{ assets?: any[] }>('/subscription-credits/topup-options');
  return (res?.assets || [])
    .filter((a) => (a.symbol === 'USDT' || a.symbol === 'USDC') && a.address && READ_RPCS[a.chainId] && a.treasuryAddress)
    .sort((a, b) => (a.symbol === b.symbol ? a.chainId - b.chainId : a.symbol === 'USDT' ? -1 : 1));
}

async function rpc(chainId: number, method: string, params: unknown[]): Promise<string> {
  for (const url of READ_RPCS[chainId] || []) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const body = await res.json();
      if (typeof body?.result === 'string') return body.result;
    } catch {
      /* next endpoint */
    }
  }
  throw new Error('Balance unavailable');
}

export async function readCoinBalances(coins: TopUpCoin[], wallet: string): Promise<Record<string, number | null>> {
  const owner = wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const entries = await Promise.all(
    coins.map(async (coin) => {
      try {
        const raw = await rpc(coin.chainId, 'eth_call', [{ to: coin.address, data: `0x70a08231${owner}` }, 'latest']);
        return [coinKey(coin), Number(raw === "0x" ? BigInt(0) : BigInt(raw)) / 10 ** coin.decimals] as const;
      } catch {
        return [coinKey(coin), null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Whole cents, rounded up, never under one cent. */
export function coinAmountFor(usd: number): string {
  return Math.max(0.01, Math.ceil(usd * 100) / 100).toFixed(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Remember a sent coin top-up and wait until the Studio balance holds it.
 * The hash is stored first, so a closed app still credits it later.
 */
export async function claimCoinTopUp(hash: string, coin: TopUpCoin, wallet: string): Promise<void> {
  await rememberPendingCreditTopUp({ hash, chainId: coin.chainId, address: wallet, asset: coin.symbol });
  const deadline = Date.now() + 3 * 60_000;
  let delay = 2500;
  while (Date.now() < deadline) {
    try {
      const result = await claimSubscriptionCreditTopUp(hash, coin.chainId, coin.symbol);
      if (result?.credited) {
        await clearPendingCreditTopUp(hash);
        return;
      }
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status && FINAL_TOPUP_STATUSES.has(status)) {
        await clearPendingCreditTopUp(hash);
        throw err;
      }
    }
    await sleep(delay);
    delay = Math.min(delay * 1.4, 8000);
  }
  throw new Error('Your payment was sent but is taking a while to arrive. It will be added to your Studio balance automatically.');
}
