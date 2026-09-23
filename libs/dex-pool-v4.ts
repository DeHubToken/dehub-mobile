/**
 * Limit orders for community pools on EVM chains.
 *
 * The same mechanism as the DHB book (see ./dex-v4.ts): an order is a one-sided
 * Uniswap v4 range position in a hookless, 0%-fee, tick-spacing-1 TOKEN/USDC
 * pool. A sell deposits the token above the market and converts to USDC as the
 * price climbs through it; a buy deposits USDC below and converts to the token.
 * The first order into a token's pool creates that pool at the order's price.
 *
 * What differs from dex-v4.ts is that nothing is fixed: the token, its decimals
 * and whether USDC sorts first all come from the pool, so every price and tick
 * conversion is derived from `usdcIs0` rather than hard-coded per chain.
 */
import { ethers } from 'ethers';
import { Percent, Token } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk';
import { readWithTimeout, type OrderStage } from './dex-read-timeout';
import { evmProvider, sendEvmTx } from './dex-evm-swap';
import type { BookPosition } from './dex-orderbook';
import { POOL_CHAIN_INFO, type DexPool, type PoolChain } from './dex-pools';

type EvmPoolChain = Exclude<PoolChain, 'solana'>;
const V4: Record<EvmPoolChain, { positionManager: string; stateView: string }> = {
  base: { positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc', stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' },
  ethereum: { positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e', stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227' },
  robinhood: { positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7', stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b' },
};
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const FEE = 0;
const TICK_SPACING = 1;
const LN_TICK = Math.log(1.0001);
const MAX_UINT160 = (1n << 160n) - 1n;
const PRICE_DECIMALS = 18;
const ZERO = ethers.constants.AddressZero;
const ERC20 = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const PERMIT = new ethers.utils.Interface([
  'function allowance(address,address,address) view returns (uint160,uint48,uint48)',
  'function approve(address,address,uint160,uint48)',
]);
const POSITION = new ethers.utils.Interface([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns ((address,address,uint24,int24,address),uint256)',
]);
const STATE = new ethers.utils.Interface([
  'function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)',
  'function getLiquidity(bytes32) view returns (uint128)',
]);
const TRANSFER_TOPIC = ethers.utils.id('Transfer(address,address,uint256)');

/** Everything about one pool's market that the maths needs. */
export interface EvmMarket {
  chain: EvmPoolChain;
  chainId: number;
  token: Token;
  usdc: Token;
  usdcIs0: boolean;
  positionManager: string;
  stateView: string;
}

export function evmMarket(pool: DexPool): EvmMarket {
  if (pool.chain === 'solana') throw new Error('Not an EVM pool');
  const info = POOL_CHAIN_INFO[pool.chain];
  const chainId = info.chainId!;
  const token = new Token(chainId, pool.token_address, pool.decimals, pool.symbol);
  const usdc = new Token(chainId, info.usdc, info.usdcDecimals, 'USDC');
  return { chain: pool.chain, chainId, token, usdc, usdcIs0: usdc.sortsBefore(token), ...V4[pool.chain] };
}

export const poolProvider = (m: EvmMarket) => evmProvider(m.chainId);
const poolId = (m: EvmMarket) => Pool.getPoolId(m.token, m.usdc, FEE, TICK_SPACING, ZERO);

/** USD per whole token at a tick. */
export function usdAtTick(m: EvmMarket, tick: number): number {
  const raw = Math.pow(1.0001, tick);
  const scale = Math.pow(10, m.token.decimals - m.usdc.decimals);
  return m.usdcIs0 ? scale / raw : raw * scale;
}

function tickAtUsd(m: EvmMarket, usd: number): number {
  const scale = Math.pow(10, m.token.decimals - m.usdc.decimals);
  const raw = m.usdcIs0 ? scale / usd : usd / scale;
  return Math.log(raw) / LN_TICK;
}

function tickRange(m: EvmMarket, floor: number, ceiling: number): [number, number] {
  const a = tickAtUsd(m, floor), b = tickAtUsd(m, ceiling);
  // Keep the actual range inside the stated price bounds.
  const lower = Math.ceil(Math.min(a, b)), upper = Math.floor(Math.max(a, b));
  if (lower < TickMath.MIN_TICK || upper > TickMath.MAX_TICK || lower >= upper) {
    throw new Error('The selected price range is too narrow or outside Uniswap limits');
  }
  return [lower, upper];
}

function initialSqrtPrice(m: EvmMarket, usd: string): ReturnType<typeof encodeSqrtRatioX96> {
  const priceUnits = BigInt(ethers.utils.parseUnits(usd, PRICE_DECIMALS).toString());
  if (priceUnits <= 0n) throw new Error('Enter a positive price');
  const tokenOne = 10n ** BigInt(m.token.decimals) * 10n ** BigInt(PRICE_DECIMALS);
  const usdcFor = priceUnits * 10n ** BigInt(m.usdc.decimals);
  // sqrt(amount1 / amount0), in base units.
  return m.usdcIs0 ? encodeSqrtRatioX96(tokenOne.toString(), usdcFor.toString()) : encodeSqrtRatioX96(usdcFor.toString(), tokenOne.toString());
}

type PoolState = { sqrtPriceX96: bigint; tick: number; liquidity: bigint };
async function readPool(m: EvmMarket): Promise<PoolState> {
  const state = new ethers.Contract(m.stateView, STATE, poolProvider(m));
  const [slot0, liquidity] = await readWithTimeout(Promise.all([state.getSlot0(poolId(m)), state.getLiquidity(poolId(m))]), 'Pool state');
  return { sqrtPriceX96: BigInt(slot0[0].toString()), tick: Number(slot0[1]), liquidity: BigInt(liquidity.toString()) };
}

/** The v4 pool's own price, or null before its first order. */
export async function evmPoolPrice(m: EvmMarket): Promise<number | null> {
  const state = await readPool(m);
  return state.sqrtPriceX96 === 0n ? null : usdAtTick(m, state.tick);
}

export interface EvmOrderInput { walletAddress: string; side: 'buy' | 'sell'; amount: string; minPrice: string; maxPrice: string }
export interface EvmOrderQuote { amountIn: bigint; willCreatePool: boolean; calldata: string; value: string; tickLower: number; tickUpper: number }

const priceString = (value: string) => /^\d+(?:\.\d{1,18})?$/.test(value);

export async function quoteEvmOrder(m: EvmMarket, input: EvmOrderInput): Promise<EvmOrderQuote> {
  const deposit = input.side === 'sell' ? m.token : m.usdc;
  const amountIn = BigInt(ethers.utils.parseUnits(input.amount, deposit.decimals).toString());
  const floor = Number(input.minPrice), ceiling = Number(input.maxPrice);
  if (amountIn <= 0n || !(floor > 0) || !(ceiling > floor) || !priceString(input.minPrice) || !priceString(input.maxPrice)) {
    throw new Error('Enter a valid amount and price range');
  }
  const [tickLower, tickUpper] = tickRange(m, floor, ceiling);
  const state = await readPool(m);
  const willCreatePool = state.sqrtPriceX96 === 0n;
  const initialSqrt = willCreatePool ? initialSqrtPrice(m, input.side === 'sell' ? input.minPrice : input.maxPrice) : null;
  const sqrtPriceX96 = initialSqrt ? initialSqrt.toString() : state.sqrtPriceX96.toString();
  const currentTick = initialSqrt ? TickMath.getTickAtSqrtRatio(initialSqrt) : state.tick;
  // "Above the market in dollars" is below the current tick when USDC is token0.
  const aboveMarket = m.usdcIs0 ? currentTick >= tickUpper : currentTick <= tickLower;
  const belowMarket = m.usdcIs0 ? currentTick <= tickLower : currentTick >= tickUpper;
  if (input.side === 'sell' ? !aboveMarket : !belowMarket) {
    throw new Error(input.side === 'sell'
      ? `This range overlaps the pool price. Move it above the market to list ${m.token.symbol} alone.`
      : 'This range overlaps the pool price. Move it below the market to list USDC alone.');
  }
  const pool = new Pool(m.token, m.usdc, FEE, TICK_SPACING, ZERO, sqrtPriceX96, willCreatePool ? '0' : state.liquidity.toString(), currentTick);
  const depositIs0 = deposit.sortsBefore(input.side === 'sell' ? m.usdc : m.token);
  const position = Position.fromAmounts({
    pool, tickLower, tickUpper,
    amount0: depositIs0 ? amountIn.toString() : '0',
    amount1: depositIs0 ? '0' : amountIn.toString(),
    useFullPrecision: true,
  });
  if (position.liquidity.toString() === '0') throw new Error('Amount is too small for this range');
  const { amount0, amount1 } = position.mintAmounts;
  const [used, other] = depositIs0 ? [amount0, amount1] : [amount1, amount0];
  if (BigInt(other.toString()) !== 0n || BigInt(used.toString()) > amountIn) throw new Error('The position would require more tokens than requested');
  const { calldata, value } = V4PositionManager.addCallParameters(position, {
    recipient: input.walletAddress, slippageTolerance: new Percent(0, 1),
    deadline: Math.floor(Date.now() / 1000) + 1200, hookData: '0x',
    createPool: willCreatePool, sqrtPriceX96: willCreatePool ? sqrtPriceX96 : undefined,
  });
  return { amountIn, willCreatePool, calldata, value, tickLower, tickUpper };
}

async function assertWallet(signingProvider: any, expected: string) {
  const [actual] = await readWithTimeout(signingProvider.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet account');
  if (actual?.toLowerCase() !== expected.toLowerCase()) throw new Error('Connect the wallet holding this balance');
}

async function ensureApproval(m: EvmMarket, input: EvmOrderInput, amount: bigint, signingProvider: any, progress: (stage: OrderStage) => void) {
  if (amount > MAX_UINT160) throw new Error('Amount exceeds Permit2 limits');
  const deposit = input.side === 'sell' ? m.token : m.usdc;
  const provider = poolProvider(m);
  const token = new ethers.Contract(deposit.address, ERC20, provider);
  progress('balance');
  const balance = BigInt((await readWithTimeout(token.balanceOf(input.walletAddress) as Promise<ethers.BigNumber>, 'Token balance')).toString());
  if (balance < amount) throw new Error(`Insufficient ${deposit.symbol} on ${POOL_CHAIN_INFO[m.chain].name}`);
  const allowance = BigInt((await readWithTimeout(token.allowance(input.walletAddress, PERMIT2) as Promise<ethers.BigNumber>, 'Token allowance')).toString());
  if (allowance < amount) {
    progress('tokenApproval');
    await sendEvmTx(signingProvider, m.chainId, input.walletAddress, { to: deposit.address, data: ERC20.encodeFunctionData('approve', [PERMIT2, amount.toString()]) }, `${deposit.symbol} approval`);
  }
  const permit = new ethers.Contract(PERMIT2, PERMIT, provider);
  const [permitted, expiration] = await readWithTimeout(permit.allowance(input.walletAddress, deposit.address, m.positionManager) as Promise<[ethers.BigNumber, number, number]>, 'Position allowance');
  if (BigInt(permitted.toString()) < amount || Number(expiration) <= Math.floor(Date.now() / 1000) + 1200) {
    progress('permitApproval');
    await sendEvmTx(signingProvider, m.chainId, input.walletAddress, {
      to: PERMIT2, data: PERMIT.encodeFunctionData('approve', [deposit.address, m.positionManager, amount.toString(), Math.floor(Date.now() / 1000) + 86400]),
    }, 'Position approval');
  }
}

/** Place the order and return the position NFT id with its mint hash. */
export async function placeEvmOrder(m: EvmMarket, input: EvmOrderInput, signingProvider: any, progress: (stage: OrderStage) => void = () => {}): Promise<{ tokenId: string; txHash: string }> {
  progress('quote');
  let quote = await quoteEvmOrder(m, input);
  progress('wallet');
  await assertWallet(signingProvider, input.walletAddress);
  await ensureApproval(m, input, quote.amountIn, signingProvider, progress);
  // Approvals take time; the pool may have moved.
  quote = await quoteEvmOrder(m, input);
  progress('submit');
  const hash = await sendEvmTx(signingProvider, m.chainId, input.walletAddress,
    { to: m.positionManager, data: quote.calldata, value: BigInt(quote.value) }, `${m.token.symbol} order`);
  progress('confirm');
  const receipt = await readWithTimeout(poolProvider(m).getTransactionReceipt(hash), 'Transaction receipt');
  const mint = receipt?.logs.find((log) => log.address.toLowerCase() === m.positionManager.toLowerCase() && log.topics[0] === TRANSFER_TOPIC &&
    log.topics[1] === `0x${'0'.repeat(64)}` && log.topics[2]?.toLowerCase() === `0x${input.walletAddress.slice(2).toLowerCase().padStart(64, '0')}`);
  if (!mint?.topics[3]) throw new Error('Order placed but its position could not be identified yet. Refresh in a minute.');
  return { tokenId: BigInt(mint.topics[3]).toString(), txHash: hash };
}

export interface EvmOrder extends BookPosition {
  tokenId: string;
  owner: string;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  side: 'buy' | 'sell';
  status: 'Open' | 'In range' | 'Filled';
}

/** Read one order back from the chain. Null when it is gone or not in this pool. */
export async function readEvmOrder(m: EvmMarket, tokenId: string, side: 'buy' | 'sell', pool?: PoolState): Promise<EvmOrder | null> {
  const manager = new ethers.Contract(m.positionManager, POSITION, poolProvider(m));
  try {
    const [owner, liquidityRaw, info] = await Promise.all([
      manager.ownerOf(tokenId) as Promise<string>,
      manager.getPositionLiquidity(tokenId) as Promise<ethers.BigNumber>,
      manager.getPoolAndPositionInfo(tokenId) as Promise<[[string, string, number, number, string], ethers.BigNumber]>,
    ]);
    const liquidity = BigInt(liquidityRaw.toString());
    const [key, packedRaw] = info;
    const expected = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['tuple(address,address,uint24,int24,address)'],
      [[key[0], key[1], key[2], key[3], key[4]]]));
    if (!liquidity || expected !== poolId(m)) return null;
    const packed = BigInt(packedRaw.toString());
    const unpack = (shift: bigint) => { const v = Number((packed >> shift) & 0xffffffn); return v >= 0x800000 ? v - 0x1000000 : v; };
    const tickLower = unpack(8n), tickUpper = unpack(32n);
    const state = pool ?? await readPool(m);
    const sdkPool = new Pool(m.token, m.usdc, FEE, TICK_SPACING, ZERO, state.sqrtPriceX96.toString(), state.liquidity.toString(), state.tick);
    const position = new Position({ pool: sdkPool, liquidity: liquidity.toString(), tickLower, tickUpper });
    const [tokenAmount, usdcAmount] = m.usdcIs0 ? [position.amount1, position.amount0] : [position.amount0, position.amount1];
    const prices = [usdAtTick(m, tickLower), usdAtTick(m, tickUpper)];
    // Sells finish when the price is above the range; in tick terms that flips with the token order.
    const aboveRange = m.usdcIs0 ? state.tick <= tickLower : state.tick >= tickUpper;
    const belowRange = m.usdcIs0 ? state.tick >= tickUpper : state.tick <= tickLower;
    const status = side === 'sell' ? aboveRange ? 'Filled' : belowRange ? 'Open' : 'In range'
      : belowRange ? 'Filled' : aboveRange ? 'Open' : 'In range';
    return {
      tokenId, owner, liquidity, tickLower, tickUpper, side, status,
      minPrice: Math.min(...prices), maxPrice: Math.max(...prices), marketPrice: usdAtTick(m, state.tick),
      amountDhb: Number(ethers.utils.formatUnits(tokenAmount.quotient.toString(), m.token.decimals)),
      amountUsdc: Number(ethers.utils.formatUnits(usdcAmount.quotient.toString(), m.usdc.decimals)),
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'CALL_EXCEPTION') return null;
    throw error;
  }
}

export async function readEvmOrders(m: EvmMarket, rows: { order_ref: string; side: 'buy' | 'sell' }[]): Promise<EvmOrder[]> {
  if (!rows.length) return [];
  const state = await readPool(m);
  const orders = await Promise.all(rows.map((row) => readEvmOrder(m, row.order_ref, row.side, state).catch(() => null)));
  return orders.filter((o): o is EvmOrder => !!o);
}

export async function withdrawEvmOrder(m: EvmMarket, order: EvmOrder, walletAddress: string, signingProvider: any): Promise<string> {
  const fresh = await readEvmOrder(m, order.tokenId, order.side);
  if (!fresh) throw new Error('This order has already been withdrawn');
  if (fresh.owner.toLowerCase() !== walletAddress.toLowerCase()) throw new Error('Only the order owner can withdraw');
  await assertWallet(signingProvider, walletAddress);
  const state = await readPool(m);
  const pool = new Pool(m.token, m.usdc, FEE, TICK_SPACING, ZERO, state.sqrtPriceX96.toString(), state.liquidity.toString(), state.tick);
  const position = new Position({ pool, liquidity: fresh.liquidity.toString(), tickLower: fresh.tickLower, tickUpper: fresh.tickUpper });
  const call = V4PositionManager.removeCallParameters(position, {
    tokenId: fresh.tokenId, liquidityPercentage: new Percent(1, 1), slippageTolerance: new Percent(5, 1000),
    deadline: Math.floor(Date.now() / 1000) + 1200, burnToken: true,
  });
  return sendEvmTx(signingProvider, m.chainId, walletAddress, { to: m.positionManager, data: call.calldata, value: BigInt(call.value) }, 'Withdrawal');
}
