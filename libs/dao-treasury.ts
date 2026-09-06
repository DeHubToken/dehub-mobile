/**
 * DAO treasury
 * ============
 * Mirror of web's `src/lib/dao-treasury.ts`. One wallet anyone can send DHB
 * to; the balance is `balanceOf` on each chain and the contributor table is
 * every ERC-20 Transfer into it, summed per sender. Nothing is stored
 * server-side, so the two clients cannot disagree.
 *
 * Contributions count on Base and BNB. Those are the chains the app can pay
 * on and the only ones with an archive RPC behind them: the public Ethereum
 * nodes refuse a full-history log query, so Ethereum shows a balance only.
 */

import { ChainId, DHB_ADDRESSESS } from '../config/constants';
import { NETWORK_URLS } from '../config/web3.constants';
import env from '../config/env';

/** Same address as the EVM line on dehub.io/docs/donate. Change both or neither. */
export const DAO_TREASURY_ADDRESS = '0x1759ceb6255dbebfe2c0c51edbcd29ad7efb9229';

export const DAO_CONTRIBUTION_CHAINS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];
export const DAO_BALANCE_CHAINS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET, ChainId.MAINNET];

export const DAO_CHAIN_META: Record<number, { name: string; explorerUrl: string }> = {
  [ChainId.BASE_MAINNET]: { name: 'Base', explorerUrl: 'https://basescan.org' },
  [ChainId.BSC_MAINNET]: { name: 'BNB', explorerUrl: 'https://bscscan.com' },
  [ChainId.MAINNET]: { name: 'Ethereum', explorerUrl: 'https://etherscan.io' },
};

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BALANCE_OF_SELECTOR = '0x70a08231';

export interface DaoChainBalance {
  chainId: number;
  name: string;
  explorerUrl: string;
  amount: number;
}

export interface DaoContribution {
  txHash: string;
  chainId: number;
  from: string;
  amount: number;
  timestamp: number;
}

export interface DaoContributor {
  address: string;
  amount: number;
  /** Fraction of every DHB ever sent to the treasury, 0..1. */
  share: number;
  txCount: number;
  lastAt: number;
  chainIds: number[];
}

export interface DaoTreasurySnapshot {
  balances: DaoChainBalance[];
  totalBalance: number;
  totalContributed: number;
  contributors: DaoContributor[];
  recent: DaoContribution[];
  fetchedAt: number;
}

type RpcLog = {
  transactionHash: string;
  blockNumber: string;
  blockTimestamp?: string;
  topics: string[];
  data: string;
};

/**
 * The archive endpoints web already uses, fetched once per app session from
 * the same edge function. Native callers send no Origin, so the function's
 * same-origin check passes them and only the per-IP rate limit applies.
 */
let archiveUrls: Promise<Record<number, string>> | null = null;
function getArchiveUrls(): Promise<Record<number, string>> {
  if (!archiveUrls) {
    archiveUrls = (async () => {
      try {
        const key = env.SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(`${env.SUPABASE_URL}/functions/v1/get-rpc-endpoints`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
          body: '{}',
        });
        if (!res.ok) return {};
        const data = (await res.json()) as { base?: string; bsc?: string };
        const out: Record<number, string> = {};
        if (data?.base) out[ChainId.BASE_MAINNET] = data.base;
        if (data?.bsc) out[ChainId.BSC_MAINNET] = data.bsc;
        return out;
      } catch {
        return {};
      }
    })();
  }
  return archiveUrls;
}

async function rpcUrlFor(chainId: number): Promise<string> {
  const archive = await getArchiveUrls();
  return archive[chainId] || NETWORK_URLS[chainId];
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || `${method} failed`);
  return json.result as T;
}

function fromWei(hex: string): number {
  // Hermes has BigInt; keep six decimals, DHB amounts fit a double easily.
  const value = BigInt(hex || '0x0');
  return Number(value / BigInt(1e12)) / 1e6;
}

function topicToAddress(topic: string): string {
  return ('0x' + topic.slice(-40)).toLowerCase();
}

async function readBalance(chainId: number): Promise<DaoChainBalance> {
  const meta = DAO_CHAIN_META[chainId];
  const base = { chainId, name: meta.name, explorerUrl: meta.explorerUrl, amount: 0 };
  const token = DHB_ADDRESSESS[chainId];
  if (!token) return base;
  try {
    const data = BALANCE_OF_SELECTOR + '000000000000000000000000' + DAO_TREASURY_ADDRESS.slice(2);
    const hex = await rpc<string>(await rpcUrlFor(chainId), 'eth_call', [{ to: token, data }, 'latest']);
    return { ...base, amount: fromWei(hex) };
  } catch {
    return base;
  }
}

async function readIncoming(chainId: number): Promise<DaoContribution[]> {
  const token = DHB_ADDRESSESS[chainId];
  if (!token) return [];
  const url = await rpcUrlFor(chainId);
  const filter = {
    address: token,
    topics: [TRANSFER_TOPIC, null, '0x000000000000000000000000' + DAO_TREASURY_ADDRESS.slice(2)],
  };

  let logs: RpcLog[] = [];
  try {
    logs = await rpc<RpcLog[]>(url, 'eth_getLogs', [{ ...filter, fromBlock: '0x0', toBlock: 'latest' }]);
  } catch {
    // A public node that caps the range: walk the most recent stretch in
    // chunks so the screen shows something rather than nothing.
    const latest = BigInt(await rpc<string>(url, 'eth_blockNumber', []));
    const span = BigInt(9_000);
    const floor = latest > span * BigInt(120) ? latest - span * BigInt(120) : BigInt(0);
    const chunks: Promise<RpcLog[]>[] = [];
    for (let from = floor; from <= latest; from += span + BigInt(1)) {
      const to = from + span > latest ? latest : from + span;
      chunks.push(
        rpc<RpcLog[]>(url, 'eth_getLogs', [
          { ...filter, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) },
        ]).catch(() => []),
      );
    }
    logs = (await Promise.all(chunks)).flat();
  }

  const missing = [...new Set(logs.filter((l) => !l.blockTimestamp).map((l) => l.blockNumber))];
  const stamps: Record<string, number> = {};
  for (let i = 0; i < missing.length; i += 10) {
    await Promise.all(
      missing.slice(i, i + 10).map(async (bn) => {
        try {
          const block = await rpc<{ timestamp: string }>(url, 'eth_getBlockByNumber', [bn, false]);
          stamps[bn] = parseInt(block.timestamp, 16);
        } catch {
          stamps[bn] = 0;
        }
      }),
    );
  }

  return logs
    .filter((l) => l.topics?.length === 3)
    .map((l) => ({
      txHash: l.transactionHash,
      chainId,
      from: topicToAddress(l.topics[1]),
      amount: fromWei(l.data),
      timestamp: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : stamps[l.blockNumber] || 0,
    }))
    .filter((c) => c.amount > 0 && c.from !== DAO_TREASURY_ADDRESS);
}

export function rankContributors(transfers: DaoContribution[]): DaoContributor[] {
  const byAddress = new Map<string, DaoContributor>();
  for (const t of transfers) {
    const row = byAddress.get(t.from) ?? {
      address: t.from,
      amount: 0,
      share: 0,
      txCount: 0,
      lastAt: 0,
      chainIds: [],
    };
    row.amount += t.amount;
    row.txCount += 1;
    row.lastAt = Math.max(row.lastAt, t.timestamp);
    if (!row.chainIds.includes(t.chainId)) row.chainIds.push(t.chainId);
    byAddress.set(t.from, row);
  }
  const total = [...byAddress.values()].reduce((sum, r) => sum + r.amount, 0);
  return [...byAddress.values()]
    .map((r) => ({ ...r, share: total > 0 ? r.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export async function fetchDaoTreasury(): Promise<DaoTreasurySnapshot> {
  const [balances, incoming] = await Promise.all([
    Promise.all(DAO_BALANCE_CHAINS.map(readBalance)),
    Promise.all(DAO_CONTRIBUTION_CHAINS.map((id) => readIncoming(id).catch(() => [] as DaoContribution[]))),
  ]);
  const transfers = incoming.flat().sort((a, b) => b.timestamp - a.timestamp);
  const contributors = rankContributors(transfers);
  return {
    balances,
    totalBalance: balances.reduce((sum, b) => sum + b.amount, 0),
    totalContributed: contributors.reduce((sum, c) => sum + c.amount, 0),
    contributors,
    recent: transfers.slice(0, 20),
    fetchedAt: Date.now(),
  };
}

export function daoTxUrl(chainId: number, txHash: string): string {
  return `${DAO_CHAIN_META[chainId]?.explorerUrl || 'https://bscscan.com'}/tx/${txHash}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDhb(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return Math.round(amount).toLocaleString();
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return amount.toFixed(4);
}

export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct === 0) return '0%';
  if (pct < 0.01) return '<0.01%';
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}
