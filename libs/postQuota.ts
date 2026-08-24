/**
 * Daily home-feed allowance — how many of an account's posts the HOME FEED
 * carries per day, derived from its DHB staking badge tier.
 *
 * Mirror of web's `src/lib/post-quota.ts`. Keep the two in sync: the same post
 * list has to compose the same way on both surfaces, or the app and the site
 * disagree about who is on the feed today.
 *
 * This is a display rule, not a posting limit: anyone may publish as much as
 * they like, everything always shows on their profile, and followers keep
 * seeing all of it. Beyond this allowance a post simply stops appearing on the
 * general home feed.
 *
 * Everyone gets one post a day on the feed; each badge tier above that adds one
 * more — 1 (no badge) -> 2 (Crab) -> ... -> 14 (Meglodon), in the same order as
 * `BADGE_ORDER` in `libs/misc.ts`. Adding a tier there adds a post here
 * automatically; do not hand-write the numbers.
 */
import { BADGE_ORDER, getBadgeName } from "./misc";

/** Feed slots per day for a wallet with no staking badge. */
export const BASELINE_FEED_POSTS_PER_DAY = 1;

/**
 * Usernames web hands a top-tier allowance regardless of balance, copied from
 * `USERNAME_BADGE_OVERRIDES` in web's `src/lib/staking-badges.ts`.
 *
 * Mirrored here for the ALLOWANCE ONLY, not for which badge image renders —
 * mobile's `getBadgeName` has never carried these overrides and changing that
 * would silently restyle badges across the app. Without this the same account
 * gets 14 feed slots on web and 6 on mobile, which is exactly the disagreement
 * this module exists to prevent.
 */
const USERNAME_ALLOWANCE_OVERRIDES: Record<string, string> = {
  maldoteth: "Meglodon",
  mal: "Meglodon",
  aaron: "Meglodon",
};

export interface PostAllowanceInfo {
  /** Posts per day this wallet gets on the home feed. */
  postsPerDay: number;
  /** Badge tier the allowance came from, or "Starter" with no badge. */
  tierName: string;
  isBaseline: boolean;
}

export function getPostAllowanceForBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
): PostAllowanceInfo {
  let badge: string | undefined;

  const clean = username ? username.replace("@", "").toLowerCase() : "";
  if (clean && USERNAME_ALLOWANCE_OVERRIDES[clean]) {
    badge = USERNAME_ALLOWANCE_OVERRIDES[clean];
  } else if (badgeBalance !== undefined && badgeBalance !== null) {
    badge = getBadgeName(badgeBalance);
  }

  // index -1 (no badge) lands on the baseline; every tier adds one.
  const index = badge ? BADGE_ORDER.indexOf(badge) : -1;

  return {
    postsPerDay: BASELINE_FEED_POSTS_PER_DAY + index + 1,
    tierName: badge ?? "Starter",
    isBaseline: index < 0,
  };
}

/** The author fields a feed row can carry, across the API's two item shapes. */
interface AuthorLike {
  minter?: string;
  minterUsername?: string;
  minterUser?: { address?: string; username?: string; badgeBalance?: number | string };
  creatorId?: string;
  creatorUsername?: string;
  creatorBadgeBalance?: number | string;
  author?: { id?: string; handle?: string; badgeBalance?: number | string };
  createdAt?: string | number;
}

/** Stable author key for a feed row, or null when the row names no author. */
function authorKey(item: AuthorLike): string | null {
  const raw =
    item?.author?.id ??
    item?.creatorId ??
    item?.minterUser?.address ??
    item?.minter ??
    null;
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  return key || null;
}

/**
 * Drop each author's posts beyond their daily allowance.
 *
 * Buckets by UTC day so yesterday's slots are never spent on today's posts, and
 * keeps whichever posts came first in the list the server sent — newest under a
 * recency sort, top-ranked under the others, same as web. Rows with no
 * identifiable author pass through untouched rather than sharing one bucket.
 */
export function capFeedByAuthorAllowance<T extends AuthorLike>(items: T[]): T[] {
  const seen = new Map<string, number>();

  return items.filter((item) => {
    const key = authorKey(item);
    if (!key) return true;

    const allowance = getPostAllowanceForBadge(
      item?.author?.badgeBalance ?? item?.creatorBadgeBalance ?? item?.minterUser?.badgeBalance,
      item?.author?.handle ?? item?.creatorUsername ?? item?.minterUsername,
    ).postsPerDay;

    const created = new Date(item?.createdAt ?? "");
    const day = Number.isFinite(created.getTime()) ? created.toISOString().slice(0, 10) : "unknown";
    const bucket = `${key}|${day}`;

    const used = seen.get(bucket) ?? 0;
    if (used >= allowance) return false;
    seen.set(bucket, used + 1);
    return true;
  });
}
