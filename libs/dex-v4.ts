import { dexProvider } from './dex-rpc';
export { dexProvider } from './dex-rpc';
import { readReceiptFromProviders } from './dex-receipt';
import { ethers } from 'ethers';
import env from '../config/env';
import { Percent, Token } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk';
import { ChainId } from '../config/constants';
import { DHB_TOKEN_ADDRESSES } from '../config/web3.constants';
import { readWithTimeout, type OrderStage } from './dex-read-timeout';

export function dexReceipt(chainId: DexChainId, hash: string) {
  return readReceiptFromProviders(dexProvider(chainId).providerConfigs.map(config => config.provider), hash);
}

export type DexChainId = ChainId.BASE_MAINNET | ChainId.BSC_MAINNET;
export const DEX_CHAINS = {
  [ChainId.BASE_MAINNET]: {
    name: 'Base',
    dhb: DHB_TOKEN_ADDRESSES[ChainId.BASE_MAINNET],
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcDecimals: 6,
    manager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
  },
  [ChainId.BSC_MAINNET]: {
    name: 'BNB Chain',
    dhb: DHB_TOKEN_ADDRESSES[ChainId.BSC_MAINNET],
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdcDecimals: 18,
    manager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
    stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
  },
} as const;

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const FEE = 0;
const SPACING = 1;
const MAX_UINT160 = (1n << 160n) - 1n;
const ERC20 = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const PERMIT = new ethers.utils.Interface([
  'function allowance(address,address,address) view returns (uint160,uint48,uint48)',
  'function approve(address,address,uint160,uint48)',
]);
const STATE = new ethers.utils.Interface([
  'function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)',
  'function getLiquidity(bytes32) view returns (uint128)',
]);
const POSITION_READ = new ethers.utils.Interface([
  'function ownerOf(uint256) view returns (address)',
  'function getPositionLiquidity(uint256) view returns (uint128)',
  'function getPoolAndPositionInfo(uint256) view returns ((address,address,uint24,int24,address),uint256)',
]);
// A confirmed mint receipt is immutable; avoid fetching it on every market tick.
const verifiedMints = new Set<string>();

export interface SellInput {
  walletAddress: string;
  chainId: DexChainId;
  side: 'buy' | 'sell';
  amount: string;
  minPrice: string;
  maxPrice: string;
}

export interface IndexedPosition {
  chain_id: number;
  token_id: string;
  owner_address: string;
  mint_tx_hash: string;
  dhb_amount: number | null;
  usdc_amount: number | null;
  side: 'buy' | 'sell';
  min_usdc_per_dhb: number;
  max_usdc_per_dhb: number;
}

export interface VerifiedPosition extends IndexedPosition {
  owner: string;
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  poolFee: number;
  tickSpacing: number;
  status: 'Open' | 'In range' | 'Filled';
  minPrice: number;
  maxPrice: number;
  amountDhb: number;
  amountUsdc: number;
  marketPrice: number;
}

function unpackTick(value: bigint, shift: bigint) {
  const raw = Number((value >> shift) & 0xffffffn);
  return raw >= 0x800000 ? raw - 0x1000000 : raw;
}

function usdAtTick(tick: number, chainId: DexChainId) {
  const raw = Math.pow(1.0001, tick);
  return chainId === ChainId.BASE_MAINNET ? 1e12 / raw : raw;
}

export async function verifyPosition(row: IndexedPosition, blockTag?: number): Promise<VerifiedPosition | null> {
  if (row.chain_id !== ChainId.BASE_MAINNET && row.chain_id !== ChainId.BSC_MAINNET) return null;
  const chainId = row.chain_id;
  const cfg = DEX_CHAINS[chainId];
  const provider = dexProvider(chainId);
  const manager = new ethers.Contract(cfg.manager, POSITION_READ, provider);
  try {
    const mintKey = `${chainId}:${row.token_id}:${row.owner_address.toLowerCase()}:${row.mint_tx_hash.toLowerCase()}`;
    const [owner, liquidity, info, receipt] = await Promise.all([
      manager.ownerOf(row.token_id, { blockTag }), manager.getPositionLiquidity(row.token_id, { blockTag }),
      manager.getPoolAndPositionInfo(row.token_id, { blockTag }),
      verifiedMints.has(mintKey) ? Promise.resolve(null) : dexReceipt(chainId, row.mint_tx_hash),
    ]);
    if (liquidity.isZero() ||
      (row.side !== 'buy' && row.side !== 'sell')) return null;
    const mintTopic = ethers.utils.id('Transfer(address,address,uint256)');
    const minted = verifiedMints.has(mintKey) || (receipt?.status === 1 && receipt.logs.some((log) => log.address.toLowerCase() === cfg.manager.toLowerCase() &&
      log.topics[0] === mintTopic && log.topics[1] === `0x${'0'.repeat(64)}` &&
      log.topics[2]?.toLowerCase() === `0x${row.owner_address.slice(2).toLowerCase().padStart(64, '0')}` &&
      log.topics[3] === `0x${BigInt(row.token_id).toString(16).padStart(64, '0')}`));
    if (!minted) return null;
    verifiedMints.add(mintKey);
    const [key, packed] = info;
    const currencies = [key[0].toLowerCase(), key[1].toLowerCase()];
    const poolFee = Number(key[2]);
    const tickSpacing = Number(key[3]);
    const supportedPool = (poolFee === 0 && tickSpacing === 1) ||
      (poolFee === 3000 && tickSpacing === 60);
    if (!currencies.includes(cfg.dhb.toLowerCase()) || !currencies.includes(cfg.usdc.toLowerCase()) ||
      !supportedPool ||
      key[4].toLowerCase() !== ethers.constants.AddressZero) return null;
    const positionInfo = BigInt(packed.toString());
    const lower = unpackTick(positionInfo, 8n);
    const upper = unpackTick(positionInfo, 32n);
    if (lower >= upper) return null;
    const prices = [usdAtTick(lower, chainId), usdAtTick(upper, chainId)];
    const poolId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
      ['tuple(address,address,uint24,int24,address)'], [[key[0], key[1], key[2], key[3], key[4]]]));
    const state = new ethers.Contract(cfg.stateView, STATE, provider);
    const [slot0, poolLiquidity] = await Promise.all([
      state.getSlot0(poolId, { blockTag }), state.getLiquidity(poolId, { blockTag }),
    ]);
    const tick = Number(slot0[1]);
    const dhb = new Token(chainId, cfg.dhb, 18, 'DHB');
    const usdc = new Token(chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
    const pool = new Pool(dhb, usdc, poolFee, tickSpacing, ethers.constants.AddressZero,
      slot0[0].toString(), poolLiquidity.toString(), tick);
    const sdkPosition = new Position({ pool, liquidity: liquidity.toString(), tickLower: lower, tickUpper: upper });
    const amountDhb = Number(ethers.utils.formatUnits(
      (chainId === ChainId.BASE_MAINNET ? sdkPosition.amount1 : sdkPosition.amount0).quotient.toString(), 18));
    const amountUsdc = Number(ethers.utils.formatUnits(
      (chainId === ChainId.BASE_MAINNET ? sdkPosition.amount0 : sdkPosition.amount1).quotient.toString(), cfg.usdcDecimals));
    const status = row.side === 'sell'
      ? chainId === ChainId.BASE_MAINNET ? tick <= lower ? 'Filled' : tick >= upper ? 'Open' : 'In range'
        : tick >= upper ? 'Filled' : tick <= lower ? 'Open' : 'In range'
      : chainId === ChainId.BASE_MAINNET ? tick >= upper ? 'Filled' : tick <= lower ? 'Open' : 'In range'
        : tick <= lower ? 'Filled' : tick >= upper ? 'Open' : 'In range';
    return { ...row, owner, liquidity: liquidity.toString(), tickLower: lower, tickUpper: upper,
      poolFee, tickSpacing, amountDhb, amountUsdc,
      marketPrice: chainId === ChainId.BASE_MAINNET ? 1e12 / (Number(slot0[0].toString()) / 2 ** 96) ** 2 : (Number(slot0[0].toString()) / 2 ** 96) ** 2,
      status, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
  } catch (error) { if ((error as { code?: string }).code === 'CALL_EXCEPTION') return null; throw error; }
}

export async function detectDhbChain(address: string): Promise<{
  chainId: DexChainId | null; balance: string; base: string; bnb: string;
}> {
  const [baseRead, bnbRead] = await Promise.allSettled([
    readWithTimeout(new ethers.Contract(DEX_CHAINS[ChainId.BASE_MAINNET].dhb, ERC20, dexProvider(ChainId.BASE_MAINNET)).balanceOf(address) as Promise<ethers.BigNumber>, 'Base balance'),
    readWithTimeout(new ethers.Contract(DEX_CHAINS[ChainId.BSC_MAINNET].dhb, ERC20, dexProvider(ChainId.BSC_MAINNET)).balanceOf(address) as Promise<ethers.BigNumber>, 'BNB balance'),
  ]);
  if (baseRead.status === 'rejected' && bnbRead.status === 'rejected') {
    throw new Error('Could not read DHB balances on Base or BNB Chain');
  }
  const base = baseRead.status === 'fulfilled' ? baseRead.value : ethers.constants.Zero;
  const bnb = bnbRead.status === 'fulfilled' ? bnbRead.value : ethers.constants.Zero;
  const chainId: DexChainId | null = base.gt(0) ? ChainId.BASE_MAINNET : bnb.gt(0) ? ChainId.BSC_MAINNET : null;
  return {
    chainId,
    balance: ethers.utils.formatUnits(chainId === ChainId.BASE_MAINNET ? base : bnb, 18),
    base: ethers.utils.formatUnits(base, 18), bnb: ethers.utils.formatUnits(bnb, 18),
  };
}

export async function detectUsdcChain(address: string): Promise<{ chainId: DexChainId | null; balance: string; base: string; bnb: string }> {
  const [baseRead, bnbRead] = await Promise.allSettled([
    readWithTimeout(new ethers.Contract(DEX_CHAINS[ChainId.BASE_MAINNET].usdc, ERC20, dexProvider(ChainId.BASE_MAINNET)).balanceOf(address) as Promise<ethers.BigNumber>, 'Base balance'),
    readWithTimeout(new ethers.Contract(DEX_CHAINS[ChainId.BSC_MAINNET].usdc, ERC20, dexProvider(ChainId.BSC_MAINNET)).balanceOf(address) as Promise<ethers.BigNumber>, 'BNB balance'),
  ]);
  if (baseRead.status === 'rejected' && bnbRead.status === 'rejected') {
    throw new Error('Could not read USDC balances on Base or BNB Chain');
  }
  const base = baseRead.status === 'fulfilled' ? baseRead.value : ethers.constants.Zero;
  const bnb = bnbRead.status === 'fulfilled' ? bnbRead.value : ethers.constants.Zero;
  const chainId: DexChainId | null = base.gt(0) ? ChainId.BASE_MAINNET : bnb.gt(0) ? ChainId.BSC_MAINNET : null;
  return {
    chainId,
    balance: ethers.utils.formatUnits(chainId === ChainId.BASE_MAINNET ? base : bnb, chainId ? DEX_CHAINS[chainId].usdcDecimals : 6),
    base: ethers.utils.formatUnits(base, DEX_CHAINS[ChainId.BASE_MAINNET].usdcDecimals),
    bnb: ethers.utils.formatUnits(bnb, DEX_CHAINS[ChainId.BSC_MAINNET].usdcDecimals),
  };
}

function ticks(chainId: DexChainId, floor: number, ceiling: number): [number, number] {
  const lowerRaw = chainId === ChainId.BASE_MAINNET ? 1e12 / ceiling : floor;
  const upperRaw = chainId === ChainId.BASE_MAINNET ? 1e12 / floor : ceiling;
  const lower = Math.ceil(Math.log(lowerRaw) / Math.log(1.0001) / SPACING) * SPACING;
  const upper = Math.floor(Math.log(upperRaw) / Math.log(1.0001) / SPACING) * SPACING;
  if (lower < TickMath.MIN_TICK || upper > TickMath.MAX_TICK || lower >= upper) {
    throw new Error('The selected price range is too narrow or outside Uniswap limits');
  }
  return [lower, upper];
}

function initialSqrt(chainId: DexChainId, floor: string): ReturnType<typeof encodeSqrtRatioX96> {
  const floorUnits = BigInt(ethers.utils.parseUnits(floor, 8).toString());
  if (floorUnits <= 0n) throw new Error('Enter a positive minimum price');
  return chainId === ChainId.BASE_MAINNET
    ? encodeSqrtRatioX96((10n ** 20n).toString(), floorUnits.toString())
    : encodeSqrtRatioX96(floorUnits.toString(), (10n ** 8n).toString());
}

export async function quoteSell(input: SellInput) {
  const cfg = DEX_CHAINS[input.chainId];
  const amountWei = BigInt(ethers.utils.parseUnits(input.amount,
    input.side === 'sell' ? 18 : cfg.usdcDecimals).toString());
  const floor = Number(input.minPrice);
  const ceiling = Number(input.maxPrice);
  if (amountWei <= 0n || !Number.isFinite(floor) || !Number.isFinite(ceiling) ||
      floor <= 0 || ceiling <= floor || !/^\d+(?:\.\d{1,8})?$/.test(input.minPrice) ||
      !/^\d+(?:\.\d{1,8})?$/.test(input.maxPrice)) {
    throw new Error('Enter a valid amount and price range (up to 8 decimal places)');
  }
  const [tickLower, tickUpper] = ticks(input.chainId, floor, ceiling);
  const dhb = new Token(input.chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(input.chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, FEE, SPACING, ethers.constants.AddressZero);
  const provider = dexProvider(input.chainId);
  const state = new ethers.Contract(cfg.stateView, STATE, provider);
  const [slot0, liquidity] = await readWithTimeout(Promise.all([state.getSlot0(poolId), state.getLiquidity(poolId)]), 'Pool preparation');
  const createPool = slot0[0].isZero();
  const startingSqrt = createPool ? initialSqrt(input.chainId,
    input.side === 'sell' ? input.minPrice : input.maxPrice) : null;
  const sqrt = startingSqrt ? startingSqrt.toString() : slot0[0].toString();
  const currentTick = startingSqrt ? TickMath.getTickAtSqrtRatio(startingSqrt) : Number(slot0[1]);
  const oneSided = input.side === 'sell'
    ? input.chainId === ChainId.BASE_MAINNET ? currentTick >= tickUpper : currentTick <= tickLower
    : input.chainId === ChainId.BASE_MAINNET ? currentTick <= tickLower : currentTick >= tickUpper;
  if (!oneSided) throw new Error(input.side === 'sell'
    ? 'This range overlaps the pool price. Move it above the market price to list DHB alone.'
    : 'This range overlaps the pool price. Move it below the market price to list USDC alone.');
  const pool = new Pool(dhb, usdc, FEE, SPACING, ethers.constants.AddressZero,
    sqrt, createPool ? '0' : liquidity.toString(), currentTick);
  const position = Position.fromAmounts({
    pool, tickLower, tickUpper,
    amount0: (input.side === 'sell') === (input.chainId === ChainId.BSC_MAINNET) ? amountWei.toString() : '0',
    amount1: (input.side === 'sell') === (input.chainId === ChainId.BASE_MAINNET) ? amountWei.toString() : '0',
    useFullPrecision: true,
  });
  if (position.liquidity.toString() === '0') throw new Error('Amount is too small for this range');
  const requested = input.side === 'sell'
    ? input.chainId === ChainId.BASE_MAINNET ? position.mintAmounts.amount1 : position.mintAmounts.amount0
    : input.chainId === ChainId.BASE_MAINNET ? position.mintAmounts.amount0 : position.mintAmounts.amount1;
  const other = input.side === 'sell'
    ? input.chainId === ChainId.BASE_MAINNET ? position.mintAmounts.amount0 : position.mintAmounts.amount1
    : input.chainId === ChainId.BASE_MAINNET ? position.mintAmounts.amount1 : position.mintAmounts.amount0;
  if (BigInt(other.toString()) !== 0n || BigInt(requested.toString()) > amountWei) {
    throw new Error('The position would require more tokens than requested');
  }
  const call = V4PositionManager.addCallParameters(position, {
    recipient: input.walletAddress,
    slippageTolerance: new Percent(0, 1),
    deadline: Math.floor(Date.now() / 1000) + 1200,
    hookData: '0x', createPool,
    sqrtPriceX96: startingSqrt?.toString(),
  });
  return { amountWei, tickLower, tickUpper, createPool, ...call };
}

async function sendTx(signingProvider: any, chainId: DexChainId, from: string, to: string, data: string, value = '0x0', submitted?: (hash: string) => void) {
  const actualChain = await readWithTimeout(signingProvider.request({ method: 'eth_chainId' }) as Promise<string>, 'Wallet network');
  const accounts = await readWithTimeout(signingProvider.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet address');
  if (Number(BigInt(actualChain)) !== chainId || accounts[0]?.toLowerCase() !== from.toLowerCase()) throw new Error('Wallet account or network changed. Review the order again.');
  const hash = await signingProvider.request({
    method: 'eth_sendTransaction', params: [{ from, to, data, value }],
  }) as string;
  submitted?.(hash);
  const receipt = await readReceiptFromProviders(dexProvider(chainId).providerConfigs.map(config => ({
    getTransactionReceipt: (txHash: string) => config.provider.waitForTransaction(txHash, 1, 60_000),
  })), hash);
  if (!receipt) throw new Error('Transaction was not confirmed yet');
  if (receipt.status !== 1) throw Object.assign(new Error('Transaction reverted. No changes were confirmed.'), { code: 'DEX_REVERTED' });
  return receipt;
}

export async function mintSell(input: SellInput, signingProvider: any, progress: (stage: OrderStage) => void = () => {}, submitted?: (hash: string) => void): Promise<{ tokenId: string; txHash: string }> {
  const accounts = await readWithTimeout(signingProvider.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet account');
  if (!accounts[0] || accounts[0].toLowerCase() !== input.walletAddress.toLowerCase()) {
    throw new Error('The signing wallet does not match this DHB address');
  }
  progress('quote');
  let quote = await quoteSell(input);
  if (quote.amountWei > MAX_UINT160) throw new Error('Amount exceeds Permit2 limits');
  const cfg = DEX_CHAINS[input.chainId];
  const provider = dexProvider(input.chainId);
  const tokenAddress = input.side === 'sell' ? cfg.dhb : cfg.usdc;
  const token = new ethers.Contract(tokenAddress, ERC20, provider);
  progress('balance');
  const balance = await readWithTimeout(token.balanceOf(input.walletAddress) as Promise<ethers.BigNumber>, 'Token balance');
  if (BigInt(balance.toString()) < quote.amountWei) throw new Error('Insufficient token balance');
  const allowance = await readWithTimeout(token.allowance(input.walletAddress, PERMIT2) as Promise<ethers.BigNumber>, 'Token allowance');
  if (BigInt(allowance.toString()) < quote.amountWei) {
    progress('tokenApproval');
    await sendTx(signingProvider, input.chainId, input.walletAddress, tokenAddress,
      ERC20.encodeFunctionData('approve', [PERMIT2, quote.amountWei.toString()]));
  }
  const permit = new ethers.Contract(PERMIT2, PERMIT, provider);
  const [permitted, expiration] = await readWithTimeout(permit.allowance(input.walletAddress, tokenAddress, cfg.manager) as Promise<[ethers.BigNumber, number, number]>, 'Position allowance');
  if (BigInt(permitted.toString()) < quote.amountWei || Number(expiration) <= Date.now() / 1000 + 1200) {
    progress('permitApproval');
    await sendTx(signingProvider, input.chainId, input.walletAddress, PERMIT2,
      PERMIT.encodeFunctionData('approve', [tokenAddress, cfg.manager, quote.amountWei.toString(), Math.floor(Date.now() / 1000) + 86400]));
  }
  quote = await quoteSell(input);
  progress('submit');
  const receipt = await sendTx(signingProvider, input.chainId, input.walletAddress, cfg.manager,
    quote.calldata, ethers.BigNumber.from(quote.value).toHexString(), (hash) => { progress('confirm'); submitted?.(hash); });
  return recoverMint(input, receipt.transactionHash);
}

export async function recoverMint(input: SellInput, hash: string): Promise<{ tokenId: string; txHash: string }> {
  const cfg = DEX_CHAINS[input.chainId];
  const receipt = await readWithTimeout(dexReceipt(input.chainId, hash), 'Transaction receipt');
  if (!receipt) throw new Error('Transaction submitted. Confirmation is not available yet.');
  if (receipt.status !== 1) throw Object.assign(new Error('The position transaction reverted. No position was created.'), { code: 'DEX_REVERTED' });
  const transferTopic = ethers.utils.id('Transfer(address,address,uint256)');
  const mintLog = receipt.logs.find((log: ethers.providers.Log) =>
    log.address.toLowerCase() === cfg.manager.toLowerCase() &&
    log.topics[0] === transferTopic &&
    log.topics[1] === `0x${'0'.repeat(64)}` &&
    log.topics[2]?.toLowerCase() === `0x${input.walletAddress.slice(2).toLowerCase().padStart(64, '0')}`,
  );
  if (!mintLog?.topics[3]) throw new Error('Position minted but its NFT could not be identified');
  return { tokenId: BigInt(mintLog.topics[3]).toString(), txHash: receipt.transactionHash };
}

export async function withdrawSell(position: VerifiedPosition, walletAddress: string, signingProvider: any) {
  const fresh = await readWithTimeout(verifyPosition(position), 'Position refresh');
  if (!fresh) throw new Error('This position has already been withdrawn or is unavailable');
  position = fresh;
  if (position.owner.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Only the current position owner can withdraw');
  }
  const chainId = position.chain_id as DexChainId;
  const cfg = DEX_CHAINS[chainId];
  const accounts = await readWithTimeout(signingProvider.request({ method: 'eth_accounts' }) as Promise<string[]>, 'Wallet account');
  if (accounts[0]?.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Connect the wallet that owns this position');
  }
  const dhb = new Token(chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, position.poolFee, position.tickSpacing, ethers.constants.AddressZero);
  const state = new ethers.Contract(cfg.stateView, STATE, dexProvider(chainId));
  const [slot0, poolLiquidity] = await Promise.all([state.getSlot0(poolId), state.getLiquidity(poolId)]);
  const pool = new Pool(dhb, usdc, position.poolFee, position.tickSpacing, ethers.constants.AddressZero,
    slot0[0].toString(), poolLiquidity.toString(), Number(slot0[1]));
  const sdkPosition = new Position({ pool, liquidity: position.liquidity,
    tickLower: position.tickLower, tickUpper: position.tickUpper });
  const call = V4PositionManager.removeCallParameters(sdkPosition, {
    tokenId: position.token_id,
    liquidityPercentage: new Percent(1, 1),
    slippageTolerance: new Percent(5, 1000),
    deadline: Math.floor(Date.now() / 1000) + 1200,
    burnToken: true,
  });
  const receipt = await sendTx(signingProvider, chainId, walletAddress, cfg.manager, call.calldata,
    ethers.BigNumber.from(call.value).toHexString());
  return receipt.transactionHash;
}
