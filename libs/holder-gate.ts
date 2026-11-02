/**
 * Holder groups
 * =============
 * A community can require members to hold a token. The database verifies the
 * holding itself (dehubweb supabase/migrations/20261102020000_community_holder_gate.sql):
 * the app only starts a check and reads its outcome, it never reports a balance.
 * Mirrors dehubweb src/hooks/use-holder-gate.ts.
 */

import { tokenLabel } from "./token-label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "./supabase-wallet-client";
import { translateCopy as _translateCopy } from "../i18n/copy";
import type { Community } from "../types/community";

type Wallet = string | null | undefined;

async function rpc<T>(fn: string, args: Record<string, unknown>, walletAddress: Wallet): Promise<T> {
  if (!walletAddress) throw new Error("not_authenticated");
  const { data, error } = await withWalletHeader((supabase as any).rpc(fn, args), walletAddress);
  if (error) throw error;
  return data as T;
}

/** DeHub's own token on each chain. Shown as "tokens" with the DeHub coin. */
export const DEHUB_TOKEN_BY_CHAIN: Record<number, string> = {
  56: "0x680d3113caf77b61b510f332d5ef4cf5b41a761d",
  8453: "0xd20ab1015f6a2de4a6fddebab270113f689c2f7c",
  1: "0x99bb69ee1bbfc7706c3ebb79b21c5b698fe58ec0",
};

export function isDehubToken(gate: { chainId: number; token: string } | null | undefined): boolean {
  return !!gate && DEHUB_TOKEN_BY_CHAIN[gate.chainId] === gate.token.toLowerCase();
}

export const HOLDER_GATE_CHAINS = [
  { id: 56, label: 'BNB Chain', rpc: 'https://bsc-rpc.publicnode.com' },
  { id: 8453, label: 'Base', rpc: 'https://base-rpc.publicnode.com' },
  { id: 1, label: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
] as const;

export type HolderGateChainId = (typeof HOLDER_GATE_CHAINS)[number]['id'];

export interface HolderGate {
  chainId: number;
  token: string;
  min: number;
  symbol: string | null;
  decimals: number;
}

export function holderGateOf(community: Community | null | undefined): HolderGate | null {
  if (!community?.holder_gate_token || !community.holder_gate_chain_id) return null;
  return {
    chainId: community.holder_gate_chain_id,
    token: community.holder_gate_token,
    min: Number(community.holder_gate_min ?? 0),
    symbol: community.holder_gate_symbol ?? null,
    decimals: community.holder_gate_decimals ?? 18,
  };
}

export function chainLabel(chainId: number): string {
  return HOLDER_GATE_CHAINS.find(c => c.id === chainId)?.label ?? `Chain ${chainId}`;
}

/** "1,000 DHB" — trims dust, keeps big numbers readable. */
export function formatHolderAmount(amount: number, symbol?: string | null): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const text = n >= 1000
    ? Math.round(n).toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 2 });
  // DeHub's own token reads as "tokens" everywhere, never "DHB".
  const isDhb = !symbol || /^(?:\$?DHB|DEHUB)$/i.test(symbol.trim());
  return `${text} ${tokenLabel(symbol) || (isDhb ? 'tokens' : symbol)}`;
}

export interface HolderCheckResult {
  status: 'open' | 'done' | 'pending' | 'failed' | 'none';
  balance?: number;
  min?: number;
  symbol?: string | null;
  eligible?: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ask the database to read the caller's balance, then wait for the chain's
 * reply. Resolves 'failed' when the node does not answer in time.
 */
export async function runHolderCheck(communityId: string, walletAddress: string | null | undefined): Promise<HolderCheckResult> {
  const started = await rpc<HolderCheckResult>('community_holder_check_start', { _community_id: communityId }, walletAddress);
  if (started?.status === 'open') return { status: 'open', eligible: true };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(attempt === 0 ? 400 : 700);
    const result = await rpc<HolderCheckResult>('community_holder_check_result', { _community_id: communityId }, walletAddress);
    if (result && result.status !== 'pending') {
      return { ...result, balance: Number(result.balance ?? 0), min: Number(result.min ?? 0) };
    }
  }
  return { status: 'failed' };
}

export function holderGateMessage(result: HolderCheckResult, gate: HolderGate | null): string {
  if (result.status === 'failed') {
    return _translateCopy('communities.holderGate.failed', { defaultValue: "Couldn't read your balance right now. Try again in a moment." });
  }
  return _translateCopy('communities.holderGate.short', {
    defaultValue: 'Holders only: you need {{need}}. You hold {{have}}.',
    need: formatHolderAmount(gate?.min ?? result.min ?? 0, gate?.symbol ?? result.symbol),
    have: formatHolderAmount(result.balance ?? 0, gate?.symbol ?? result.symbol),
  });
}


export interface CommunityHolder {
  wallet_address: string;
  balance: number;
  checked_at: string;
}

/** Biggest verified holders first. Balances are on-chain public data. */
export function useCommunityHolders(communityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['communities', 'holders', communityId],
    enabled: !!communityId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CommunityHolder[]> => {
      const { data, error } = await (supabase as any)
        .from('community_holders')
        .select('wallet_address, balance, checked_at')
        .eq('community_id', communityId)
        .order('balance', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({ ...row, balance: Number(row.balance) }));
    },
  });
}

/** 1-based rank among verified holders, or null when unranked. */
export function holderRank(holders: CommunityHolder[] | undefined, wallet: string | null | undefined): number | null {
  if (!holders || !wallet) return null;
  const i = holders.findIndex(h => h.wallet_address === wallet.toLowerCase());
  return i >= 0 ? i + 1 : null;
}


/** symbol() and decimals() straight from the chain, for the owner's form. */
export async function readTokenMeta(chainId: number, token: string): Promise<{ symbol: string | null; decimals: number | null }> {
  const rpc = HOLDER_GATE_CHAINS.find(c => c.id === chainId)?.rpc;
  if (!rpc || !/^0x[0-9a-fA-F]{40}$/.test(token)) return { symbol: null, decimals: null };
  const call = async (data: string) => {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: token, data }, 'latest'] }),
    });
    const json = await res.json();
    return typeof json?.result === 'string' ? json.result as string : null;
  };
  try {
    const [symHex, decHex] = await Promise.all([call('0x95d89b41'), call('0x313ce567')]);
    const decimals = decHex && decHex !== '0x' ? parseInt(decHex, 16) : null;
    return { symbol: decodeAbiString(symHex), decimals: Number.isFinite(decimals) ? decimals : null };
  } catch {
    return { symbol: null, decimals: null };
  }
}

function decodeAbiString(hex: string | null): string | null {
  if (!hex || hex.length < 3) return null;
  const body = hex.slice(2);
  const bytes = (h: string) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
    return out;
  };
  let raw: number[];
  if (body.length >= 128) {
    const length = parseInt(body.slice(64, 128), 16);
    raw = bytes(body.slice(128, 128 + length * 2));
  } else {
    raw = bytes(body).filter(b => b !== 0); // bytes32 symbols
  }
  const text = String.fromCharCode(...raw).replace(/[^\x20-\x7e]/g, '').trim();
  return text ? text.slice(0, 16) : null;
}

export function setHolderGate(walletAddress: Wallet, communityId: string, gate: HolderGate | null): Promise<Community> {
  return rpc<Community>("community_set_holder_gate", {
    _community_id: communityId,
    _chain_id: gate?.chainId ?? null,
    _token: gate?.token ?? null,
    _min: gate?.min ?? null,
    _symbol: gate?.symbol ?? null,
    _decimals: gate?.decimals ?? null,
  }, walletAddress);
}
