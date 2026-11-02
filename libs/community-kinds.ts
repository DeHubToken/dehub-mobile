/**
 * Groups and channels
 * ===================
 * Both are communities with a `kind`. A group is a chat everyone talks in; a
 * channel is one only the owner and admins post to. Either can charge a
 * one-off entry price in DeHub tokens, paid straight to the owner. The
 * database reads the transfer off the chain itself before it lets the member
 * in. Mirrors dehubweb src/lib/community-kinds.ts.
 */

import { rpc } from "./holder-gate";
import type { Community, UserCommunityRow } from "../types/community";

export type CommunityKind = "community" | "group" | "channel";

export function communityKindOf(community: Partial<Community> | null | undefined): CommunityKind {
  const kind = (community as any)?.kind;
  return kind === "group" || kind === "channel" ? kind : "community";
}

/** Whole DeHub tokens to get in, or 0 when it is free. */
export function entryPriceOf(community: Partial<Community> | null | undefined): number {
  const price = Number((community as any)?.entry_price ?? 0);
  return Number.isFinite(price) && price > 0 ? Math.ceil(price) : 0;
}

/** Groups and channels the wallet is in, newest first, for the Messages list. */
export function chatsFromMemberships(rows: UserCommunityRow[] | undefined): Community[] {
  return (rows ?? [])
    .map((row: any) => row.communities as Community | null)
    .filter((c): c is Community => !!c && communityKindOf(c) !== "community")
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

export interface EntryResult {
  status: "free" | "paid" | "pending" | "failed" | "none";
  amount?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function entryStatus(communityId: string, wallet: string | null | undefined): Promise<EntryResult> {
  return rpc<EntryResult>("community_entry_check", { _community_id: communityId }, wallet);
}

/** Hand the database the transfer's hash, then wait until it has read it. */
export async function confirmEntry(
  communityId: string,
  wallet: string | null | undefined,
  chainId: number,
  txHash: string,
): Promise<EntryResult> {
  await rpc("community_entry_submit", { _community_id: communityId, _chain_id: chainId, _tx_hash: txHash }, wallet);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(attempt === 0 ? 800 : 1500);
    const result = await entryStatus(communityId, wallet);
    if (result && result.status !== "pending") return result;
  }
  return { status: "failed" };
}
