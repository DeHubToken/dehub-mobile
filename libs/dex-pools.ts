/**
 * Community pools on the DEX.
 *
 * DHB/USD is the house book. Anyone can open another for any token on Base,
 * Ethereum, Robinhood Chain or Solana by paying the $100 listing fee, which is
 * always settled as DHB to the treasury: a wallet short of DHB swaps what it
 * does hold on Base into DHB first, in the same user operation where it can.
 * The dex-pool-create function confirms the transfer on chain before the pool
 * exists, so the fee cannot be skipped by writing the row directly.
 */
import { ethers } from 'ethers';
import * as Crypto from 'expo-crypto';
import env from '../config/env';
import { ChainId, ROBINHOOD_TOKENS } from '../config/constants';
import { DHB_TOKEN_ADDRESSES } from '../config/web3.constants';
import { supabase } from '../services/supabase';
import { dehubAuthHeaders } from '../services/ai.service';
import { withWalletHeader } from './supabase-wallet-client';
import { contentTypeForExtension, fileExtension, uploadLocalFileToBucket } from './storage-upload';
import { NATIVE, evmProvider, quoteSwap, runSwap, sendEvmTx, type SwapCall } from './dex-evm-swap';
import { readWithTimeout } from './dex-read-timeout';

export type PoolChain = 'base' | 'ethereum' | 'robinhood' | 'solana';
export const POOL_CHAINS: PoolChain[] = ['base', 'ethereum', 'robinhood', 'solana'];
export const POOL_FEE_USD = 100;
export const DEX_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';
const SOLANA_EXPLORER = 'https://solscan.io';
const ROBINHOOD_EXPLORER = 'https://explorer.mainnet.chain.robinhood.com';

export interface PoolChainInfo {
  name: string;
  /** EVM chain id; null for Solana. */
  chainId: number | null;
  usdc: string;
  usdcDecimals: number;
  /** Address page on the explorer, for a token or a wallet. */
  address: (address: string) => string;
  tx: (hash: string) => string;
}

export const POOL_CHAIN_INFO: Record<PoolChain, PoolChainInfo> = {
  base: {
    name: 'Base', chainId: ChainId.BASE_MAINNET, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', usdcDecimals: 6,
    address: (a) => `https://basescan.org/token/${a}`, tx: (h) => `https://basescan.org/tx/${h}`,
  },
  ethereum: {
    name: 'Ethereum', chainId: ChainId.MAINNET, usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', usdcDecimals: 6,
    address: (a) => `https://etherscan.io/token/${a}`, tx: (h) => `https://etherscan.io/tx/${h}`,
  },
  robinhood: {
    name: 'Robinhood Chain', chainId: ChainId.ROBINHOOD_MAINNET, usdc: ROBINHOOD_TOKENS.USDC, usdcDecimals: 6,
    address: (a) => `${ROBINHOOD_EXPLORER}/token/${a}`, tx: (h) => `${ROBINHOOD_EXPLORER}/tx/${h}`,
  },
  solana: {
    name: 'Solana', chainId: null, usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', usdcDecimals: 6,
    address: (a) => `${SOLANA_EXPLORER}/token/${a}`, tx: (h) => `${SOLANA_EXPLORER}/tx/${h}`,
  },
};

export interface DexPool {
  id: string;
  chain: PoolChain;
  token_address: string;
  symbol: string;
  name: string;
  decimals: number;
  image_url: string | null;
  creator_address: string;
  fee_tx_hash: string;
  fee_dhb: number;
  fee_usd: number;
  created_at: string;
}

export interface TokenCheck {
  exists: boolean;
  pool?: DexPool;
  token?: { symbol: string; name: string; decimals: number; imageUrl: string | null; priceUsd: number | null };
  feeUsd?: number;
  feeDhb?: number | null;
  dhbUsd?: number | null;
}

export function isPoolChain(value: unknown): value is PoolChain {
  return typeof value === 'string' && (POOL_CHAINS as string[]).includes(value);
}

export function isTokenAddress(chain: PoolChain, value: string): boolean {
  return chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim()) : /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export const normaliseTokenAddress = (chain: PoolChain, value: string) => chain === 'solana' ? value.trim() : value.trim().toLowerCase();

// Postgres numerics arrive as strings; the screens do arithmetic on these.
const toPool = (row: Record<string, unknown>): DexPool => ({ ...(row as unknown as DexPool), fee_dhb: Number(row.fee_dhb), fee_usd: Number(row.fee_usd) });

export async function listPools(): Promise<DexPool[]> {
  const { data, error } = await supabase.from('dex_pools' as never).select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toPool);
}

export async function getPool(chain: PoolChain, tokenAddress: string): Promise<DexPool | null> {
  const { data, error } = await supabase.from('dex_pools' as never).select('*')
    .eq('chain', chain).eq('token_address', normaliseTokenAddress(chain, tokenAddress)).maybeSingle();
  if (error) throw error;
  return data ? toPool(data as Record<string, unknown>) : null;
}

/** Unwrap the server's own refusal instead of supabase-js's "non-2xx status code". */
async function callPoolFunction<T>(body: Record<string, unknown>, walletAddress: string | null): Promise<T> {
  const headers = walletAddress ? await dehubAuthHeaders(walletAddress) : {};
  if (walletAddress && !headers['x-dehub-token']) throw new Error('Sign in again to open a pool.');
  const { data, error } = await supabase.functions.invoke('dex-pool-create', { body, ...(Object.keys(headers).length ? { headers } : {}) });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail: string | undefined;
    try { detail = context ? (await context.json())?.error : undefined; } catch { /* keep the generic message */ }
    throw new Error(detail || error.message);
  }
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const checkToken = (chain: PoolChain, tokenAddress: string) =>
  callPoolFunction<TokenCheck>({ check: true, chain, tokenAddress: tokenAddress.trim() }, null);

export const createPool = (input: { chain: PoolChain; tokenAddress: string; txHash: string; imageUrl?: string | null }, walletAddress: string) =>
  callPoolFunction<{ pool: DexPool }>({ ...input }, walletAddress).then((result) => toPool(result.pool as unknown as Record<string, unknown>));

export const POOL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export interface PickedImage { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null }

export function isAcceptedPoolImage(image: PickedImage): boolean {
  const ext = fileExtension(image, 'png');
  const type = image.mimeType || contentTypeForExtension(ext, '');
  return IMAGE_TYPES.includes(type) && !(image.fileSize != null && image.fileSize > POOL_IMAGE_MAX_BYTES);
}

export async function uploadPoolImage(image: PickedImage): Promise<string> {
  if (!isAcceptedPoolImage(image)) throw new Error('Choose a PNG, JPG, WebP or GIF of 5 MB or less.');
  const ext = fileExtension(image, 'png').replace('jpeg', 'jpg');
  return uploadLocalFileToBucket({
    bucket: 'dex-pool-images', path: `${Crypto.randomUUID()}.${ext}`, uri: image.uri,
    contentType: image.mimeType || contentTypeForExtension(ext, 'image/png'),
  });
}

export async function setPoolImage(poolId: string, imageUrl: string, walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(supabase.rpc('set_dex_pool_image' as never, { p_pool_id: poolId, p_image_url: imageUrl } as never), walletAddress);
  if (error) throw error;
}

// ── Paying the listing fee ────────────────────────────────────────────────

export const DHB_BASE = DHB_TOKEN_ADDRESSES[ChainId.BASE_MAINNET];
export type FeeAssetSymbol = 'DHB' | 'ETH' | 'USDC' | 'USDT';
export interface FeeAsset { symbol: FeeAssetSymbol; address: string; decimals: number }
export const FEE_ASSETS: FeeAsset[] = [
  { symbol: 'DHB', address: DHB_BASE, decimals: 18 },
  { symbol: 'ETH', address: NATIVE, decimals: 18 },
  { symbol: 'USDC', address: POOL_CHAIN_INFO.base.usdc, decimals: 6 },
  { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
];
/** Swapping into the fee overshoots slightly so slippage never leaves it short; the rest stays with the payer. */
const SWAP_HEADROOM = 1.03;
const ERC20 = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to,uint256 amount) returns (bool)',
]);

export interface FeeBalance { asset: FeeAsset; amount: number; usd: number }

/** USD prices from the shared price endpoint, keyed by symbol. */
export async function fetchUsdPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/get-dhb-price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json();
    const prices: Record<string, number> = {};
    for (const [key, value] of Object.entries(data?.prices ?? {})) if (Number(value) > 0) prices[key] = Number(value);
    if (!prices.DHB && Number(data?.price) > 0) prices.DHB = Number(data.price);
    return prices;
  } catch { return {}; }
}

/** What the wallet holds on Base of each asset the fee can be paid with. */
export async function loadFeeBalances(walletAddress: string, prices: Record<string, number>, dhbUsd: number | null): Promise<FeeBalance[]> {
  const provider = evmProvider(ChainId.BASE_MAINNET);
  return Promise.all(FEE_ASSETS.map(async (asset) => {
    const raw = await readWithTimeout(asset.symbol === 'ETH'
      ? provider.getBalance(walletAddress)
      : new ethers.Contract(asset.address, ERC20, provider).balanceOf(walletAddress) as Promise<ethers.BigNumber>, `${asset.symbol} balance`).catch(() => ethers.constants.Zero);
    const amount = Number(ethers.utils.formatUnits(raw, asset.decimals));
    const unit = asset.symbol === 'DHB' ? dhbUsd ?? 0 : asset.symbol === 'USDC' || asset.symbol === 'USDT' ? 1 : prices[asset.symbol] ?? 0;
    return { asset, amount, usd: amount * unit };
  }));
}

export interface FeePlan {
  asset: FeeAsset;
  feeDhb: bigint;
  swap: SwapCall | null;
}

/** DHB needed for the fee, in wei, at the price the server will check against. */
export const feeDhbUnits = (feeDhb: number) => BigInt(ethers.utils.parseUnits(String(Math.ceil(feeDhb)), 18).toString());

export async function planFee(asset: FeeAsset, feeDhb: number, assetUsd: number, walletAddress: string): Promise<FeePlan> {
  const dhbUnits = feeDhbUnits(feeDhb);
  if (asset.symbol === 'DHB') {
    const balance = await readWithTimeout(new ethers.Contract(DHB_BASE, ERC20, evmProvider(ChainId.BASE_MAINNET)).balanceOf(walletAddress) as Promise<ethers.BigNumber>, 'DHB balance');
    if (BigInt(balance.toString()) < dhbUnits) throw new Error(`Not enough DHB on Base: ${ethers.utils.formatUnits(dhbUnits.toString(), 18)} needed`);
    return { asset, feeDhb: dhbUnits, swap: null };
  }
  if (!(assetUsd > 0)) throw new Error(`No ${asset.symbol} price is available right now`);
  const swapIn = BigInt(ethers.utils.parseUnits((POOL_FEE_USD * SWAP_HEADROOM / assetUsd).toFixed(asset.decimals === 6 ? 6 : 12), asset.decimals).toString());
  const swap = await quoteSwap({ chainId: ChainId.BASE_MAINNET, tokenIn: asset.address, tokenOut: DHB_BASE, amountIn: swapIn, recipient: walletAddress, slippageBps: 100 });
  if (swap.minAmountOut < dhbUnits) throw new Error(`That ${asset.symbol} does not swap into enough DHB right now`);
  return { asset, feeDhb: dhbUnits, swap };
}

/** Pay the fee on Base and return the hash of the DHB transfer the server verifies. */
export async function payFee(plan: FeePlan, signingProvider: any, walletAddress: string): Promise<string> {
  const transfer = { to: DHB_BASE, data: ERC20.encodeFunctionData('transfer', [DEX_TREASURY, plan.feeDhb.toString()]) };
  if (plan.swap) return runSwap(plan.swap, signingProvider, walletAddress, [transfer]);
  return sendEvmTx(signingProvider, ChainId.BASE_MAINNET, walletAddress, transfer, 'The fee transfer');
}
