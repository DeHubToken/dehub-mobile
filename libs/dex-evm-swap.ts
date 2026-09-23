/**
 * Instant (market) swaps on EVM chains, routed by the KyberSwap aggregator.
 *
 * Kyber quotes every DEX on Base, Ethereum and Robinhood Chain in one call and
 * hands back ready calldata for its router: best price now, one transaction,
 * no book to wait on. It is keyless, so the app talks to it directly.
 *
 * The built-in wallet is a Safe, so approve + swap (+ any follow-up call, such
 * as the pool listing fee transfer) run as ONE sponsored user operation.
 * A session without a bundler signs each call in turn.
 */
import { ethers } from 'ethers';
import { ChainId } from '../config/constants';
import { NETWORK_URLS } from '../config/web3.constants';
import { writeBatchAA } from './aa.write';
import { dexProvider } from './dex-rpc';
import { readReceiptFromProviders } from './dex-receipt';
import { readWithTimeout } from './dex-read-timeout';

/** Kyber's placeholder for the chain's native coin (ETH on all three chains here). */
export const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const KYBER = 'https://aggregator-api.kyberswap.com';
const CLIENT_ID = 'dehub';
const SLUGS: Record<number, string> = { [ChainId.BASE_MAINNET]: 'base', [ChainId.MAINNET]: 'ethereum', [ChainId.ROBINHOOD_MAINNET]: 'robinhood' };
const ERC20 = new ethers.utils.Interface([
  'function allowance(address,address) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
]);

export const isNative = (address: string) => address.toLowerCase() === NATIVE.toLowerCase() || address === '0x0' || /^0x0{40}$/.test(address);

export type EvmCall = { to: string; data: string; value?: bigint };

const providers = new Map<number, ethers.providers.FallbackProvider>();
/** Read provider for any chain a pool can live on. Base reuses the order book's own. */
export function evmProvider(chainId: number): ethers.providers.FallbackProvider {
  if (chainId === ChainId.BASE_MAINNET) return dexProvider(ChainId.BASE_MAINNET);
  let provider = providers.get(chainId);
  if (!provider) {
    const urls = chainId === ChainId.MAINNET
      ? [NETWORK_URLS[ChainId.MAINNET], 'https://ethereum-rpc.publicnode.com']
      : [NETWORK_URLS[chainId] || 'https://rpc.mainnet.chain.robinhood.com'];
    provider = new ethers.providers.FallbackProvider([...new Set(urls.filter(Boolean))].map((url, index) => ({
      provider: new ethers.providers.StaticJsonRpcProvider({ url, timeout: 10000, throttleLimit: 1 }, chainId),
      priority: index + 1, stallTimeout: 1500, weight: 1,
    })), 1);
    providers.set(chainId, provider);
  }
  return provider;
}

/** One signed transaction on any pool chain, confirmed before it returns. */
export async function sendEvmTx(signingProvider: any, chainId: number, from: string, call: EvmCall, context = 'Transaction'): Promise<string> {
  const actualChain = await readWithTimeout(signingProvider.request({ method: 'eth_chainId' }) as Promise<string>, 'Wallet network');
  const accounts = await readWithTimeout(signingProvider.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet address');
  if (Number(BigInt(actualChain)) !== chainId || accounts[0]?.toLowerCase() !== from.toLowerCase()) throw new Error('Wallet account or network changed. Review the order again.');
  const hash = await signingProvider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: call.to, data: call.data, value: ethers.BigNumber.from((call.value ?? 0n).toString()).toHexString() }],
  }) as string;
  const provider = evmProvider(chainId);
  const receipt = await readReceiptFromProviders(provider.providerConfigs.map((config) => ({
    getTransactionReceipt: (txHash: string) => config.provider.waitForTransaction(txHash, 1, 120_000),
  })), hash);
  if (!receipt) throw new Error(`${context} was sent but has not confirmed yet. Check your wallet before retrying.`);
  if (receipt.status !== 1) throw Object.assign(new Error(`${context} did not confirm`), { code: 'DEX_REVERTED' });
  return receipt.transactionHash;
}

/**
 * Run several calls: one user operation on the built-in wallet, otherwise one
 * transaction each. Returns the hash of the last call's transaction.
 */
export async function sendEvmCalls(signingProvider: any, chainId: number, from: string, calls: EvmCall[], context = 'Transaction'): Promise<string> {
  try {
    const tx = await writeBatchAA(signingProvider, calls.map((c) => ({
      to: c.to, data: c.data as `0x${string}`, value: ethers.BigNumber.from((c.value ?? 0n).toString()),
    })), { context });
    return tx.hash;
  } catch (error) {
    if ((error as Error).message !== 'BATCH_UNSUPPORTED') throw error;
  }
  let hash = '';
  for (const call of calls) hash = await sendEvmTx(signingProvider, chainId, from, call, context);
  return hash;
}

export interface SwapCall {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  /** What the router guarantees after slippage. */
  minAmountOut: bigint;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  router: string;
  data: string;
  value: bigint;
}

async function kyber<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await readWithTimeout(fetch(url, { ...init, headers: { 'x-client-id': CLIENT_ID, ...(init?.body ? { 'content-type': 'application/json' } : {}) } }), 'Swap route', 15000);
  const json = await res.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!res.ok || !json || (json.code != null && json.code !== 0) || !json.data) {
    throw new Error(json?.message ? `No swap route: ${json.message}` : 'No swap route is available right now');
  }
  return json.data;
}

export async function quoteSwap(input: { chainId: number; tokenIn: string; tokenOut: string; amountIn: bigint; recipient: string; slippageBps?: number }): Promise<SwapCall> {
  const slug = SLUGS[input.chainId];
  if (!slug) throw new Error('Instant swaps are not available on this network');
  if (input.amountIn <= 0n) throw new Error('Enter an amount');
  const tokenIn = isNative(input.tokenIn) ? NATIVE : input.tokenIn;
  const tokenOut = isNative(input.tokenOut) ? NATIVE : input.tokenOut;
  const params = `tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${input.amountIn.toString()}&gasInclude=true`;
  const route = await kyber<{ routeSummary: Record<string, unknown> & { amountOut: string; amountInUsd?: string; amountOutUsd?: string }; routerAddress: string }>(
    `${KYBER}/${slug}/api/v1/routes?${params}`);
  const built = await kyber<{ data: string; routerAddress: string; transactionValue?: string; amountOut: string }>(
    `${KYBER}/${slug}/api/v1/route/build`, {
      method: 'POST',
      body: JSON.stringify({
        routeSummary: route.routeSummary, sender: input.recipient, recipient: input.recipient,
        slippageTolerance: input.slippageBps ?? 100, deadline: Math.floor(Date.now() / 1000) + 1200, source: CLIENT_ID,
      }),
    });
  const amountOut = BigInt(built.amountOut || route.routeSummary.amountOut);
  const slippage = BigInt(input.slippageBps ?? 100);
  return {
    chainId: input.chainId, tokenIn, tokenOut, amountIn: input.amountIn, amountOut,
    minAmountOut: amountOut - amountOut * slippage / 10000n,
    amountInUsd: Number(route.routeSummary.amountInUsd) || null,
    amountOutUsd: Number(route.routeSummary.amountOutUsd) || null,
    router: built.routerAddress || route.routerAddress,
    data: built.data,
    value: BigInt(built.transactionValue || (isNative(tokenIn) ? input.amountIn : 0n)),
  };
}

/**
 * Run a quoted swap. `followUp` calls ride in the same user operation on the
 * built-in wallet; otherwise they are sent after the swap. Returns the last hash.
 */
export async function runSwap(swap: SwapCall, signingProvider: any, walletAddress: string, followUp: EvmCall[] = []): Promise<string> {
  const needsApproval = !isNative(swap.tokenIn) && BigInt((await readWithTimeout(
    new ethers.Contract(swap.tokenIn, ERC20, evmProvider(swap.chainId)).allowance(walletAddress, swap.router) as Promise<ethers.BigNumber>,
    'Token allowance')).toString()) < swap.amountIn;
  const calls: EvmCall[] = [
    ...(needsApproval ? [{ to: swap.tokenIn, data: ERC20.encodeFunctionData('approve', [swap.router, swap.amountIn.toString()]) }] : []),
    { to: swap.router, data: swap.data, value: swap.value },
    ...followUp,
  ];
  return sendEvmCalls(signingProvider, swap.chainId, walletAddress, calls, 'Swap');
}
