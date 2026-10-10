import AsyncStorage from '@react-native-async-storage/async-storage';
import { ethers } from 'ethers';
import { NETWORK_URLS } from '../config/web3.constants';
import { getSolanaRpcUrl, SOLANA_MAINNET_CHAIN_ID, SOLANA_SPL_TOKENS } from '../config/solana.constants';

export interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  isNative?: boolean;
  isCustom?: boolean;
  incomplete?: boolean;
  /** Decimal string: safe to persist, and never rounded before sending. */
  balance: string | null;
}
export type TokenMetadata = Omit<WalletToken, 'balance'>;
export const WALLET_CHAINS = [
  { id: 8453, name: 'Base', symbol: 'ETH' },
  { id: 56, name: 'BNB Chain', symbol: 'BNB' },
  { id: 1, name: 'Ethereum', symbol: 'ETH' },
  { id: 4663, name: 'Robinhood', symbol: 'ETH' },
  { id: 5042, name: 'Arc', symbol: 'USDC' },
  { id: SOLANA_MAINNET_CHAIN_ID, name: 'Solana', symbol: 'SOL' },
];
const DEFAULTS: Record<number, Array<[string, string, string, number]>> = {
  8453: [
    ['0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', 'DHB', 'DeHub', 18],
    ['0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 'USDT', 'Tether', 6],
    ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6],
    ['0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b', 'BTC', 'Bitcoin', 8],
  ],
  56: [
    ['0x680D3113caf77B61b510f332D5Ef4cf5b41A761D', 'DHB', 'DeHub', 18],
    ['0x55d398326f99059fF775485246999027B3197955', 'USDT', 'Tether', 18],
    ['0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'USDC', 'USD Coin', 18],
    ['0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', 'BTC', 'Bitcoin', 18],
  ],
  1: [
    ['0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 'Tether', 6],
    ['0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC', 'USD Coin', 6],
    ['0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'BTC', 'Bitcoin', 8],
  ],
};
const CUSTOM_KEY = 'wallet-custom-tokens-v1';
const iface = new ethers.utils.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);
const sameAddress = (a: string, b: string, chain: number) => chain === 101 ? a === b : a.toLowerCase() === b.toLowerCase();

/** Public reads never depend on the connected wallet's selected network or unlock state. */
export async function walletRpc(chainId: number, method: string, params: unknown[]): Promise<any> {
  const url = chainId === 101 ? getSolanaRpcUrl() : NETWORK_URLS[chainId];
  if (!url) throw new Error('Network unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok || body.error || body.result == null) throw new Error('Balance unavailable');
    return body.result;
  } finally { clearTimeout(timer); }
}

export async function customWalletTokens(chainId: number): Promise<TokenMetadata[]> {
  const saved = JSON.parse(await AsyncStorage.getItem(CUSTOM_KEY) || '[]');
  return Array.isArray(saved) ? saved.filter((token: TokenMetadata) => token.chainId === chainId) : [];
}
export async function saveWalletToken(token: TokenMetadata): Promise<void> {
  const saved: TokenMetadata[] = JSON.parse(await AsyncStorage.getItem(CUSTOM_KEY) || '[]');
  const next = saved.filter(item => item.chainId !== token.chainId || !sameAddress(item.address, token.address, token.chainId));
  await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify([...next, { ...token, isCustom: true }]));
}

export async function readWalletTokenMetadata(address: string, chainId: number): Promise<TokenMetadata> {
  if (chainId === 101) {
    const result = await walletRpc(chainId, 'getTokenSupply', [address]);
    const decimals = result?.value?.decimals;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid token precision');
    const known = SOLANA_SPL_TOKENS.find(token => token.address === address);
    return { address, chainId, decimals, symbol: known?.symbol || `${address.slice(0, 4)}…${address.slice(-4)}`, name: known?.name || 'Solana token' };
  }
  if (!ethers.utils.isAddress(address)) throw new Error('Invalid contract address');
  const [name, symbol, precision] = await Promise.all(['name', 'symbol', 'decimals'].map(async method => {
    const raw = await walletRpc(chainId, 'eth_call', [{ to: address, data: iface.encodeFunctionData(method) }, 'latest']);
    return iface.decodeFunctionResult(method, raw)[0];
  }));
  const decimals = Number(precision);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid token precision');
  return { address, chainId, decimals, name: String(name), symbol: String(symbol) };
}

export async function readWalletTokens(owner: string, chainId: number): Promise<WalletToken[]> {
  const custom = await customWalletTokens(chainId);
  if (chainId === 101) return readSolanaTokens(owner, custom);
  const chain = WALLET_CHAINS.find(item => item.id === chainId);
  if (!chain) throw new Error('Network unavailable');
  const defaults: TokenMetadata[] = (DEFAULTS[chainId] || []).map(([address, symbol, name, decimals]) => ({ address, symbol, name, decimals, chainId }));
  const tokens: TokenMetadata[] = [
    { address: '0x0', symbol: chain.symbol, name: chain.symbol === 'USDC' ? 'USD Coin' : chain.symbol === 'BNB' ? 'BNB' : 'Ethereum', decimals: 18, chainId, isNative: true },
    ...defaults,
    ...custom.filter(token => !defaults.some(item => sameAddress(item.address, token.address, chainId))),
  ];
  const result = await Promise.all(tokens.map(async token => {
    try {
      const raw = token.isNative
        ? await walletRpc(chainId, 'eth_getBalance', [owner, 'latest'])
        : iface.decodeFunctionResult('balanceOf', await walletRpc(chainId, 'eth_call', [{ to: token.address, data: iface.encodeFunctionData('balanceOf', [owner]) }, 'latest']))[0];
      return { ...token, balance: ethers.utils.formatUnits(raw, token.decimals) };
    } catch { return { ...token, balance: null }; }
  }));
  if (result.every(token => token.balance === null)) throw new Error('Balance unavailable');
  return result;
}

async function readSolanaTokens(owner: string, custom: TokenMetadata[]): Promise<WalletToken[]> {
  const programs = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
  const results = await Promise.allSettled([
    walletRpc(101, 'getBalance', [owner]),
    ...programs.map(programId => walletRpc(101, 'getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed' }])),
  ]);
  if (results.every(result => result.status === 'rejected')) throw new Error('Balance unavailable');
  const tokens: WalletToken[] = [];
  const native = results[0];
  tokens.push({ address: '0x0', symbol: 'SOL', name: 'Solana', decimals: 9, chainId: 101, isNative: true,
    balance: native.status === 'fulfilled' ? ethers.utils.formatUnits(String(native.value.value), 9) : null,
    incomplete: results.slice(1).some(result => result.status === 'rejected') });
  for (const result of results.slice(1)) {
    if (result.status !== 'fulfilled') continue;
    for (const account of result.value.value || []) {
      const info = account.account?.data?.parsed?.info;
      if (!info?.mint || !info.tokenAmount) continue;
      const previous = tokens.find(token => token.address === info.mint);
      const raw = ethers.BigNumber.from(info.tokenAmount.amount);
      if (previous) {
        previous.balance = ethers.utils.formatUnits(ethers.utils.parseUnits(previous.balance || '0', previous.decimals).add(raw), previous.decimals);
        continue;
      }
      const meta = custom.find(token => token.address === info.mint) || SOLANA_SPL_TOKENS.find(token => token.address === info.mint);
      tokens.push({ address: info.mint, chainId: 101, symbol: meta?.symbol || `${info.mint.slice(0, 4)}…${info.mint.slice(-4)}`,
        name: meta?.name || 'Solana token', decimals: info.tokenAmount.decimals, isCustom: !meta || custom.includes(meta as TokenMetadata),
        balance: ethers.utils.formatUnits(raw, info.tokenAmount.decimals) });
    }
  }
  for (const token of custom) {
    if (!tokens.some(existing => existing.address === token.address)) {
      tokens.push({ ...token, balance: results.slice(1).every(result => result.status === 'fulfilled') ? '0' : null });
    }
  }
  return tokens;
}

export interface WalletGroup { symbol: string; name: string; amount: number; unknown: boolean; tokens: WalletToken[] }
export function groupWalletTokens(tokens: WalletToken[]): WalletGroup[] {
  const groups = new Map<string, WalletGroup>();
  for (const token of tokens) {
    const group = groups.get(token.symbol) || { symbol: token.symbol, name: token.name, amount: 0, unknown: false, tokens: [] };
    group.amount += Number(token.balance || 0);
    group.unknown ||= token.balance === null;
    group.tokens.push(token);
    groups.set(token.symbol, group);
  }
  const order = ['DHB', 'ETH', 'BNB', 'BTC', 'USDT', 'USDC', 'SOL'];
  return [...groups.values()].sort((a, b) => (order.indexOf(a.symbol) < 0 ? 99 : order.indexOf(a.symbol)) - (order.indexOf(b.symbol) < 0 ? 99 : order.indexOf(b.symbol)));
}
