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
import { translateCopy as _translateCopy } from '../i18n/copy';

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

/**
 * Whole sentences for a transaction that did not confirm. `context` stays an
 * English label: it is also what the user-operation logs record.
 */
const UNCONFIRMED_COPY: Record<string, { pending: () => string; reverted: () => string }> = {
  Transaction: {
    pending: () => _translateCopy('copy.4fb586a2d254', { defaultValue: 'Transaction was sent but has not confirmed yet. Check your wallet before retrying.' }),
    reverted: () => _translateCopy('copy.344c74798bb2', { defaultValue: 'Transaction did not confirm' }),
  },
  Swap: {
    pending: () => _translateCopy('copy.904d94210cee', { defaultValue: 'Swap was sent but has not confirmed yet. Check your wallet before retrying.' }),
    reverted: () => _translateCopy('copy.27135cdc2328', { defaultValue: 'Swap did not confirm' }),
  },
  Withdrawal: {
    pending: () => _translateCopy('copy.058a4f240b99', { defaultValue: 'Withdrawal was sent but has not confirmed yet. Check your wallet before retrying.' }),
    reverted: () => _translateCopy('copy.d04b32e3ec44', { defaultValue: 'Withdrawal did not confirm' }),
  },
  'The fee transfer': {
    pending: () => _translateCopy('copy.2b71b64b6dd9', { defaultValue: 'The fee transfer was sent but has not confirmed yet. Check your wallet before retrying.' }),
    reverted: () => _translateCopy('copy.69f509bb1116', { defaultValue: 'The fee transfer did not confirm' }),
  },
  'Position approval': {
    pending: () => _translateCopy('copy.e933b5ecd316', { defaultValue: 'Position approval was sent but has not confirmed yet. Check your wallet before retrying.' }),
    reverted: () => _translateCopy('copy.2592c9cec433', { defaultValue: 'Position approval did not confirm' }),
  },
};

function unconfirmedMessage(context: string, reverted: boolean): string {
  const known = Object.prototype.hasOwnProperty.call(UNCONFIRMED_COPY, context) ? UNCONFIRMED_COPY[context] : undefined;
  if (known) return reverted ? known.reverted() : known.pending();
  // "USDC approval", "DHB order": the token symbol stays as it is.
  const approval = context.match(/^(\S+) approval$/);
  if (approval) {
    return reverted
      ? _translateCopy('copy.e9301bb3bd6c', { defaultValue: '{{value1}} approval did not confirm', value1: approval[1] })
      : _translateCopy('copy.95cb4814ba18', { defaultValue: '{{value1}} approval was sent but has not confirmed yet. Check your wallet before retrying.', value1: approval[1] });
  }
  const order = context.match(/^(\S+) order$/);
  if (order) {
    return reverted
      ? _translateCopy('copy.c46b4f8cd3f8', { defaultValue: '{{value1}} order did not confirm', value1: order[1] })
      : _translateCopy('copy.547e0e19216e', { defaultValue: '{{value1}} order was sent but has not confirmed yet. Check your wallet before retrying.', value1: order[1] });
  }
  return reverted
    ? _translateCopy('copy.921f3962b9b5', { defaultValue: '{{value1}} did not confirm', value1: context })
    : _translateCopy('copy.962b6edd085c', { defaultValue: '{{value1}} was sent but has not confirmed yet. Check your wallet before retrying.', value1: context });
}

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
  if (Number(BigInt(actualChain)) !== chainId || accounts[0]?.toLowerCase() !== from.toLowerCase()) throw new Error(_translateCopy('copy.2306c682204b', { defaultValue: 'Wallet account or network changed. Review the order again.' }));
  const hash = await signingProvider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: call.to, data: call.data, value: ethers.BigNumber.from((call.value ?? 0n).toString()).toHexString() }],
  }) as string;
  const provider = evmProvider(chainId);
  const receipt = await readReceiptFromProviders(provider.providerConfigs.map((config) => ({
    getTransactionReceipt: (txHash: string) => config.provider.waitForTransaction(txHash, 1, 120_000),
  })), hash);
  if (!receipt) throw new Error(unconfirmedMessage(context, false));
  if (receipt.status !== 1) throw Object.assign(new Error(unconfirmedMessage(context, true)), { code: 'DEX_REVERTED' });
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
    throw new Error(json?.message ? _translateCopy('copy.8d3a859f545f', { defaultValue: 'No swap route: {{value1}}', value1: json.message }) : _translateCopy('copy.4aeadee78066', { defaultValue: 'No swap route is available right now' }));
  }
  return json.data;
}

/** `sources` narrows the route to named Kyber DEX ids, e.g. `uniswap-v4`. */
export async function quoteSwap(input: { chainId: number; tokenIn: string; tokenOut: string; amountIn: bigint; recipient: string; slippageBps?: number; sources?: string }): Promise<SwapCall> {
  const slug = SLUGS[input.chainId];
  if (!slug) throw new Error(_translateCopy('copy.33e4a6695d4d', { defaultValue: 'Instant swaps are not available on this network' }));
  if (input.amountIn <= 0n) throw new Error(_translateCopy('copy.d8a7700e1f88', { defaultValue: 'Enter an amount' }));
  const tokenIn = isNative(input.tokenIn) ? NATIVE : input.tokenIn;
  const tokenOut = isNative(input.tokenOut) ? NATIVE : input.tokenOut;
  const params = `tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${input.amountIn.toString()}&gasInclude=true${input.sources ? `&includedSources=${encodeURIComponent(input.sources)}` : ''}`;
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
