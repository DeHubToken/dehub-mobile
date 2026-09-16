/**
 * Leaderboard ranking rules, shared with web's LeaderboardPage.
 *
 * The API and the cache hand back a raw list; what the board shows is that
 * list after the same three edits web makes — unnamed wallets dropped, a few
 * house accounts hidden, one manual balance override — and then ranked. The
 * rank is assigned here, once, so search and the sort-direction toggle can
 * reorder or thin the list without renumbering anyone.
 */

import type { LeaderboardPeriod, LeaderboardSortMode } from '../services/leaderboard.service';

/** Usernames kept off every board. */
export const BLOCKED_LEADERBOARD_USERS: readonly string[] = ['dehubdev1', 'uss', 'support'];

/** Manual balance overrides (username → total), all-time holdings only. */
export const BALANCE_OVERRIDES: Record<string, number> = {
  maldoteth: 273298163.18321,
};

export type LeaderboardSort = LeaderboardSortMode | 'affiliates';

export interface RankableEntry {
  account: string;
  username?: string;
  total?: number | null;
  sentTips?: number;
  receivedTips?: number;
  followers?: number;
  likes?: number;
  subscribers?: number;
  directReferrals?: number;
  secondaryReferrals?: number;
  delta?: number;
  hideBadgeAndBalance?: boolean;
  rank?: number;
}

export interface RuleContext {
  sort: LeaderboardSort;
  period: LeaderboardPeriod;
}

/** True when the holder has asked for their balance and badge to stay private. */
export function isHidden(entry: RankableEntry | null | undefined): boolean {
  if (!entry) return false;
  return entry.hideBadgeAndBalance === true || entry.total === null;
}

/**
 * The number a row is ranked and displayed on.
 *
 * Affiliates rank on direct referrals and carry no delta series, so they are
 * read before the delta branch. For any period other than all-time the
 * metric is the change over that period.
 */
export function getEntryValue(
  entry: RankableEntry,
  sort: LeaderboardSort,
  period: LeaderboardPeriod,
): number {
  if (sort === 'affiliates') return entry.directReferrals ?? 0;
  if (period !== 'all' && typeof entry.delta === 'number') return entry.delta;
  switch (sort) {
    case 'sentTips':
      return entry.sentTips ?? 0;
    case 'receivedTips':
      return entry.receivedTips ?? 0;
    case 'followers':
      return entry.followers ?? 0;
    case 'likes':
      return entry.likes ?? 0;
    case 'subscribers':
      return entry.subscribers ?? 0;
    default:
      return entry.total ?? 0;
  }
}

/**
 * Filter, override, sort and rank.
 *
 * Wallet-only rows (no username) are dropped except on the affiliates board,
 * where a referrer who never set a handle still brought people in. A period
 * board with any negative delta orders on the size of the move, so the
 * biggest losers sit next to the biggest gainers instead of at the bottom.
 */
export function applyLeaderboardRules<T extends RankableEntry>(
  entries: readonly T[],
  { sort, period }: RuleContext,
): T[] {
  const isAffiliates = sort === 'affiliates';
  let list = entries.filter((entry) => {
    const name = entry.username?.toLowerCase();
    if (name && BLOCKED_LEADERBOARD_USERS.includes(name)) return false;
    return isAffiliates ? true : Boolean(name);
  });

  if (sort === 'holdings' && period === 'all') {
    list = list.map((entry) => {
      const override = entry.username ? BALANCE_OVERRIDES[entry.username.toLowerCase()] : undefined;
      return override !== undefined ? { ...entry, total: override } : entry;
    });
  }

  const useAbsolute =
    period !== 'all' && !isAffiliates && list.some((entry) => (entry.delta ?? 0) < 0);
  const metric = (entry: T) => {
    const value = getEntryValue(entry, sort, period);
    return useAbsolute ? Math.abs(value) : value;
  };

  const sorted = [...list].sort((a, b) => {
    const diff = metric(b) - metric(a);
    if (diff !== 0) return diff;
    if (isAffiliates) return (b.secondaryReferrals ?? 0) - (a.secondaryReferrals ?? 0);
    return 0;
  });

  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}
