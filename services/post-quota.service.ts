/**
 * Daily posting allowance
 * =======================
 * Mirror of dehubweb's `lib/api/dehub/content.ts` quota half.
 *
 * Everyone gets ten text posts and a gigabyte of media a day; a staking badge
 * buys more of both and a discount on whatever runs over. All of it is quoted
 * by the server — the ladder is a table on the backend, and a second copy in
 * the app would be wrong the first time it moved and would price a paywall
 * differently from the charge that follows it.
 */

import { apiClient } from "../libs";

export interface PostQuotaStatus {
  /** UTC day the allowance resets on, `YYYY-MM-DD`. */
  day: string;
  /** Badge tier name, or null below the badge floor. */
  tier: string | null;
  badgeBalance: number;
  textPostsUsed: number;
  textPostsPerDay: number;
  mediaBytesUsed: number;
  mediaBytesPerDay: number;
  dhbPerTextPost: number;
  dhbPerGb: number;
  discountRate: number;
  /** DHB owed from posts already published. */
  outstandingDhb: number;
  /** True once that debt is old enough to block the next paid post. */
  blocked: boolean;
  recipient?: string;
  /** False when no treasury is configured — posting is free regardless of usage. */
  chargingEnabled: boolean;
  dhbTokens: { chainId: number; tokenAddress: string }[];
  dhbUsdPeg: number;
}

export interface PostQuotaCost {
  chargeable: boolean;
  kind: "text" | "media";
  amountDhb: number;
  chargedUnits: number;
  /** Text posts, or bytes, still free today. */
  remainingFree: number;
}

export interface PostQuotaSettlement {
  settled: boolean;
  /** The transfer has not been mined yet — call again in a moment. */
  pending?: boolean;
  appliedDhb: number;
  outstandingDhb: number;
}

function unwrap<T>(res: any): T | null {
  const raw = (res as any)?.data ?? res;
  return ((raw as any)?.result ?? raw) ?? null;
}

/** Today's allowance and what is left of it. Null on any failure. */
export async function getPostQuota(): Promise<PostQuotaStatus | null> {
  try {
    const quota = unwrap<PostQuotaStatus>(
      await apiClient.get<any>("/post_quota", { isAuthRequired: true }),
    );
    return quota && typeof quota.textPostsPerDay === "number" ? quota : null;
  } catch (e) {
    console.warn("[PostQuota] could not read the allowance", e);
    return null;
  }
}

/**
 * What one specific post would cost, given what has been posted today.
 *
 * Null rather than throwing on failure, and every caller treats null as
 * "post it": the server checks the same thing again before storing anything,
 * so a quote that could not be fetched must never be what blocks a post.
 */
export async function quotePostCharge(
  postType: string,
  bytes: number,
): Promise<PostQuotaCost | null> {
  try {
    const cost = unwrap<PostQuotaCost>(
      await apiClient.post<any>(
        "/post_quota/quote",
        { postType, bytes },
        { isAuthRequired: true },
      ),
    );
    return cost && typeof cost.amountDhb === "number" ? cost : null;
  } catch (e) {
    console.warn("[PostQuota] could not price this post", e);
    return null;
  }
}

/**
 * Hand the backend the DHB transfer that pays for an over-allowance post.
 *
 * Throws, unlike its neighbours: by the time this is called the DHB has
 * already left the wallet, so a failure here is something the caller has to
 * handle rather than swallow. Safe to repeat — the hash is claimed once
 * server-side, on a unique index.
 */
export async function settlePostCharge(
  txHash: string,
  chainId: number,
): Promise<PostQuotaSettlement> {
  const res = unwrap<PostQuotaSettlement>(
    await apiClient.post<any>(
      "/post_quota/settle",
      { txHash, chainId },
      { isAuthRequired: true },
    ),
  );
  if (!res) throw new Error("The server did not answer the settlement.");
  return res;
}
