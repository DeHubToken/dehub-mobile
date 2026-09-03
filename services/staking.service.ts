import { apiClient } from "../libs/api.client";

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
