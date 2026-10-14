import { apiClient } from "../libs/api.client";
import { queryClient } from '../config/queryClient';
import { patchTipBadges, publishTipBadges, type TipBadgeAccount } from '../libs/tip-badges';

/** Runs only after a successful receipt; errors cannot fail the payment. */
export async function refreshTipBadges(chainId: number, txHash: string): Promise<void> {
  if (chainId !== 56 && chainId !== 8453) return;
  try {
    const response: any = await apiClient.post(`/badge/tip/${chainId}/${txHash}`, {}, { isAuthRequired: false });
    const accounts: TipBadgeAccount[] = response?.result;
    if (!Array.isArray(accounts)) return;
    queryClient.setQueriesData({}, (data: unknown) => patchTipBadges(data, accounts));
    publishTipBadges(accounts);
  } catch (error) {
    console.warn('[Tip] Badge reconciliation failed', error);
  }
}

export interface StakingRefreshResult {
  address: string;
  pooledStaked: number;
  byChain: { chainId: number; staked: number }[];
  badgeBalance: number | null;
}

/**
 * Ask the API to look for a stake this wallet has just made.
 *
 * Staking is a plain token transfer, so nothing tells the backend it happened
 * — a scanner finds it on a ten-minute tick. Someone who has just sent DHB and
 * is watching the screen should not have to wait that out, so this asks the
 * API to read the blocks the scanner has not reached yet for this one wallet.
 *
 * Safe to call repeatedly: the API deduplicates what it credits and holds a
 * short per-address cooldown, so a mashed button costs one read.
 */
export async function refreshStakingPosition(
  address: string,
): Promise<StakingRefreshResult | null> {
  try {
    const res: any = await apiClient.post(
      `/staking/refresh/${address}`,
      {},
      { isAuthRequired: false },
    );
    return res?.result ?? null;
  } catch (err) {
    console.warn("[staking] refresh failed:", err);
    return null;
  }
}

/** Reconcile a confirmed DAO contribution into the shared badge balance. */
export async function refreshBadgeBalance(address: string): Promise<StakingRefreshResult | null> {
  try {
    const res: any = await apiClient.post(`/badge/refresh/${address}`, {}, { isAuthRequired: false });
    return res?.result ?? null;
  } catch {
    return null;
  }
}
