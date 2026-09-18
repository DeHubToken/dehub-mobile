import { ethers } from 'ethers';
import { Percent, Token } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { encodeSqrtRatioX96, TickMath } from '@uniswap/v3-sdk';
import { ChainId } from '../config/constants';
import { DHB_TOKEN_ADDRESSES } from '../config/web3.constants';
import { ethersService } from '../services/ethers.service';

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
const FEE = 3000;
const SPACING = 60;
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

export interface SellInput {
  walletAddress: string;
  chainId: DexChainId;
  amount: string;
  minPrice: string;
  maxPrice: string;
}

export interface IndexedPosition {
  chain_id: number;
  token_id: string;
  owner_address: string;
  mint_tx_hash: string;
  dhb_amount: number;
  min_usdc_per_dhb: number;
  max_usdc_per_dhb: number;
}

export interface VerifiedPosition extends IndexedPosition {
  owner: string;
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  status: 'Open' | 'In range' | 'Filled';
  minPrice: number;
  maxPrice: number;
}

function unpackTick(value: bigint, shift: bigint) {
  const raw = Number((value >> shift) & 0xffffffn);
  return raw >= 0x800000 ? raw - 0x1000000 : raw;
}

function usdAtTick(tick: number, chainId: DexChainId) {
  const raw = Math.pow(1.0001, tick);
  return chainId === ChainId.BASE_MAINNET ? 1e12 / raw : raw;
}

export async function verifyPosition(row: IndexedPosition): Promise<VerifiedPosition | null> {
  if (row.chain_id !== ChainId.BASE_MAINNET && row.chain_id !== ChainId.BSC_MAINNET) return null;
  const chainId = row.chain_id;
  const cfg = DEX_CHAINS[chainId];
  const provider = ethersService.getProvider(chainId);
  const manager = new ethers.Contract(cfg.manager, POSITION_READ, provider);
  try {
    const [owner, liquidity, info, receipt] = await Promise.all([
      manager.ownerOf(row.token_id), manager.getPositionLiquidity(row.token_id),
      manager.getPoolAndPositionInfo(row.token_id), provider.getTransactionReceipt(row.mint_tx_hash),
    ]);
    if (!receipt || receipt.status !== 1 || liquidity.isZero()) return null;
    const mintTopic = ethers.utils.id('Transfer(address,address,uint256)');
    const minted = receipt.logs.some((log) => log.address.toLowerCase() === cfg.manager.toLowerCase() &&
      log.topics[0] === mintTopic && log.topics[1] === `0x${'0'.repeat(64)}` &&
      log.topics[2]?.toLowerCase() === `0x${row.owner_address.slice(2).toLowerCase().padStart(64, '0')}` &&
      log.topics[3] === `0x${BigInt(row.token_id).toString(16).padStart(64, '0')}`);
    if (!minted) return null;
    const [key, packed] = info;
    const currencies = [key[0].toLowerCase(), key[1].toLowerCase()];
    if (!currencies.includes(cfg.dhb.toLowerCase()) || !currencies.includes(cfg.usdc.toLowerCase()) ||
      Number(key[2]) !== 3000 || Number(key[3]) !== 60 ||
      key[4].toLowerCase() !== ethers.constants.AddressZero) return null;
    const positionInfo = BigInt(packed.toString());
    const lower = unpackTick(positionInfo, 8n);
    const upper = unpackTick(positionInfo, 32n);
    if (lower >= upper) return null;
    const prices = [usdAtTick(lower, chainId), usdAtTick(upper, chainId)];
    const poolId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
      ['tuple(address,address,uint24,int24,address)'], [[key[0], key[1], key[2], key[3], key[4]]]));
    const state = new ethers.Contract(cfg.stateView, STATE, provider);
    const slot0 = await state.getSlot0(poolId);
    const tick = Number(slot0[1]);
    const status = chainId === ChainId.BASE_MAINNET
      ? tick <= lower ? 'Filled' : tick >= upper ? 'Open' : 'In range'
      : tick >= upper ? 'Filled' : tick <= lower ? 'Open' : 'In range';
    return { ...row, owner, liquidity: liquidity.toString(), tickLower: lower, tickUpper: upper,
      status, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
  } catch { return null; }
}

export async function detectDhbChain(address: string): Promise<{
  chainId: DexChainId | null; balance: string; base: string; bnb: string;
}> {
  const [baseRead, bnbRead] = await Promise.allSettled([
    ethersService.getErc20Balance(DEX_CHAINS[ChainId.BASE_MAINNET].dhb, address, ChainId.BASE_MAINNET),
    ethersService.getErc20Balance(DEX_CHAINS[ChainId.BSC_MAINNET].dhb, address, ChainId.BSC_MAINNET),
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
  const amountWei = BigInt(ethers.utils.parseUnits(input.amount, 18).toString());
  const floor = Number(input.minPrice);
  const ceiling = Number(input.maxPrice);
  if (amountWei <= 0n || !Number.isFinite(floor) || !Number.isFinite(ceiling) ||
      floor <= 0 || ceiling <= floor || !/^\d+(?:\.\d{1,8})?$/.test(input.minPrice) ||
      !/^\d+(?:\.\d{1,8})?$/.test(input.maxPrice)) {
    throw new Error('Enter a valid DHB amount and price range (up to 8 decimal places)');
  }
  const cfg = DEX_CHAINS[input.chainId];
  const [tickLower, tickUpper] = ticks(input.chainId, floor, ceiling);
  const dhb = new Token(input.chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(input.chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, FEE, SPACING, ethers.constants.AddressZero);
  const provider = ethersService.getProvider(input.chainId);
  const state = new ethers.Contract(cfg.stateView, STATE, provider);
  const [slot0, liquidity] = await Promise.all([state.getSlot0(poolId), state.getLiquidity(poolId)]);
  const createPool = slot0[0].isZero();
  const startingSqrt = createPool ? initialSqrt(input.chainId, input.minPrice) : null;
  const sqrt = startingSqrt ? startingSqrt.toString() : slot0[0].toString();
  const currentTick = startingSqrt ? TickMath.getTickAtSqrtRatio(startingSqrt) : Number(slot0[1]);
  const dhbOnly = input.chainId === ChainId.BASE_MAINNET ? currentTick >= tickUpper : currentTick <= tickLower;
  if (!dhbOnly) throw new Error('This range overlaps the current pool price. Move it above the market price to list DHB alone.');
  const pool = new Pool(dhb, usdc, FEE, SPACING, ethers.constants.AddressZero,
    sqrt, createPool ? '0' : liquidity.toString(), currentTick);
  const position = Position.fromAmounts({
    pool, tickLower, tickUpper,
    amount0: input.chainId === ChainId.BSC_MAINNET ? amountWei.toString() : '0',
    amount1: input.chainId === ChainId.BASE_MAINNET ? amountWei.toString() : '0',
    useFullPrecision: true,
  });
  if (position.liquidity.toString() === '0') throw new Error('DHB amount is too small for this range');
  const usdcRequired = input.chainId === ChainId.BASE_MAINNET ? position.mintAmounts.amount0 : position.mintAmounts.amount1;
  const dhbRequired = input.chainId === ChainId.BASE_MAINNET ? position.mintAmounts.amount1 : position.mintAmounts.amount0;
  if (BigInt(usdcRequired.toString()) !== 0n || BigInt(dhbRequired.toString()) > amountWei) {
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

async function sendTx(signingProvider: any, chainId: DexChainId, from: string, to: string, data: string, value = '0x0') {
  const hash = await signingProvider.request({
    method: 'eth_sendTransaction', params: [{ from, to, data, value }],
  }) as string;
  const receipt = await ethersService.getProvider(chainId).waitForTransaction(hash, 1, 120_000);
  if (!receipt || receipt.status !== 1) throw new Error('Transaction was not confirmed');
  return receipt;
}

export async function mintSell(input: SellInput, signingProvider: any): Promise<{ tokenId: string; txHash: string }> {
  const accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
  if (!accounts[0] || accounts[0].toLowerCase() !== input.walletAddress.toLowerCase()) {
    throw new Error('The signing wallet does not match this DHB address');
  }
  let quote = await quoteSell(input);
  if (quote.amountWei > MAX_UINT160) throw new Error('DHB amount exceeds Permit2 limits');
  const cfg = DEX_CHAINS[input.chainId];
  const provider = ethersService.getProvider(input.chainId);
  const token = new ethers.Contract(cfg.dhb, ERC20, provider);
  const balance = await token.balanceOf(input.walletAddress) as ethers.BigNumber;
  if (BigInt(balance.toString()) < quote.amountWei) throw new Error('Insufficient liquid DHB');
  const allowance = await token.allowance(input.walletAddress, PERMIT2) as ethers.BigNumber;
  if (BigInt(allowance.toString()) < quote.amountWei) {
    await sendTx(signingProvider, input.chainId, input.walletAddress, cfg.dhb,
      ERC20.encodeFunctionData('approve', [PERMIT2, quote.amountWei.toString()]));
  }
  const permit = new ethers.Contract(PERMIT2, PERMIT, provider);
  const [permitted, expiration] = await permit.allowance(input.walletAddress, cfg.dhb, cfg.manager);
  if (BigInt(permitted.toString()) < quote.amountWei || Number(expiration) <= Date.now() / 1000 + 1200) {
    await sendTx(signingProvider, input.chainId, input.walletAddress, PERMIT2,
      PERMIT.encodeFunctionData('approve', [cfg.dhb, cfg.manager, quote.amountWei.toString(), Math.floor(Date.now() / 1000) + 86400]));
  }
  quote = await quoteSell(input);
  const receipt = await sendTx(signingProvider, input.chainId, input.walletAddress, cfg.manager,
    quote.calldata, ethers.BigNumber.from(quote.value).toHexString());
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
  if (position.owner.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Only the current position owner can withdraw');
  }
  const chainId = position.chain_id as DexChainId;
  const cfg = DEX_CHAINS[chainId];
  const accounts = await signingProvider.request({ method: 'eth_accounts' }) as string[];
  if (accounts[0]?.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('Connect the wallet that owns this position');
  }
  const dhb = new Token(chainId, cfg.dhb, 18, 'DHB');
  const usdc = new Token(chainId, cfg.usdc, cfg.usdcDecimals, 'USDC');
  const poolId = Pool.getPoolId(dhb, usdc, FEE, SPACING, ethers.constants.AddressZero);
  const state = new ethers.Contract(cfg.stateView, STATE, ethersService.getProvider(chainId));
  const [slot0, poolLiquidity] = await Promise.all([state.getSlot0(poolId), state.getLiquidity(poolId)]);
  const pool = new Pool(dhb, usdc, FEE, SPACING, ethers.constants.AddressZero,
    slot0[0].toString(), poolLiquidity.toString(), Number(slot0[1]));
  const sdkPosition = new Position({ pool, liquidity: position.liquidity,
    tickLower: position.tickLower, tickUpper: position.tickUpper });
  const call = V4PositionManager.removeCallParameters(sdkPosition, {
    tokenId: position.token_id,
    liquidityPercentage: new Percent(1, 1),
    slippageTolerance: new Percent(5, 100),
    deadline: Math.floor(Date.now() / 1000) + 1200,
    burnToken: true,
  });
  const receipt = await sendTx(signingProvider, chainId, walletAddress, cfg.manager, call.calldata,
    ethers.BigNumber.from(call.value).toHexString());
  return receipt.transactionHash;
}
