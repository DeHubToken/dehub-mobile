/**
 * Affiliate Leaderboard
 * =====================
 * Ranks accounts by how many people they brought to DeHub.
 *
 * Every other leaderboard category is served by `/api/leaderboard`, but
 * referrals aren't in that database — they live in Supabase as
 * `affiliate_referrals`, one row per referred wallet. So this category is
 * aggregated client-side and then shaped like a normal leaderboard row, which
 * keeps the row markup, search and sort toggle untouched.
 *
 * Two counts come out of one table:
 *   - direct    — rows where the account is `owner_address` (tier 1)
 *   - secondary — rows where it is `l2_owner_address`, i.e. someone their own
 *                 referral went on to refer (tier 2)
 *
 * The table is public-SELECT by policy and small (tens of rows), so pulling it
 * whole and counting in memory is cheaper than a round trip per account.
 */

import { supabase } from './supabase';
import { getAccountSummaries, type AccountSummary } from './user.service';
import type { LeaderboardPeriod, LeaderboardUser } from './leaderboard.service';

/** Referral rows read per request. Well above the live row count. */
const MAX_REFERRAL_ROWS = 10_000;

/**
 * Profile lookups per request, in batches of this size. Every ranked row is
 * resolved — search below the top fifty has to find people by handle — but
 * the batches are sequential so a large board does not fan out into a burst
 * of requests.
 */
const MAX_PROFILE_LOOKUPS = 50;

const PERIOD_DAYS: Record<Exclude<LeaderboardPeriod, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export interface AffiliateLeaderboardEntry extends LeaderboardUser {
  /** People this account referred itself. */
  directReferrals: number;
  /** People referred by someone this account referred. */
  secondaryReferrals: number;
}

interface ReferralRow {
  owner_address: string | null;
  l2_owner_address: string | null;
  created_at: string;
}

function periodStart(period: LeaderboardPeriod): string | null {
  if (period === 'all') return null;
  const days = PERIOD_DAYS[period];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function resolveProfiles(accounts: string[]): Promise<Map<string, AccountSummary>> {
  const byAddress = new Map<string, AccountSummary>();
  for (let start = 0; start < accounts.length; start += MAX_PROFILE_LOOKUPS) {
    const batch = accounts.slice(start, start + MAX_PROFILE_LOOKUPS);
    // A profile miss is not an error — the row falls back to a short address,
    // the same as any wallet-only entry elsewhere on the board.
    const profiles = await getAccountSummaries(batch).catch(() => [] as AccountSummary[]);
    for (const profile of profiles) {
      if (profile?.address) byAddress.set(profile.address.toLowerCase(), profile);
    }
  }
  return byAddress;
}

export async function getAffiliateLeaderboard(
  period: LeaderboardPeriod = 'all',
): Promise<AffiliateLeaderboardEntry[]> {
  // @ts-ignore - affiliate_referrals not in generated Database types
  let query = supabase
    .from('affiliate_referrals' as never)
    .select('owner_address, l2_owner_address, created_at')
    .limit(MAX_REFERRAL_ROWS);

  const since = periodStart(period);
  if (since) query = query.gte('created_at', since);

  const { data, error } = (await query) as unknown as { data: ReferralRow[] | null; error: any };
  if (error) throw error;

  const direct = new Map<string, number>();
  const secondary = new Map<string, number>();

  for (const row of data ?? []) {
    // Addresses are stored however the referring client wrote them, so fold
    // case before counting or one owner ranks as two.
    const owner = row.owner_address?.toLowerCase();
    if (owner) direct.set(owner, (direct.get(owner) ?? 0) + 1);

    const l2 = row.l2_owner_address?.toLowerCase();
    // A self-referral chain would otherwise credit the same account twice for
    // one signup.
    if (l2 && l2 !== owner) secondary.set(l2, (secondary.get(l2) ?? 0) + 1);
  }

  const accounts = new Set<string>([...direct.keys(), ...secondary.keys()]);

  const ranked = [...accounts]
    .map((account) => ({
      account,
      directReferrals: direct.get(account) ?? 0,
      secondaryReferrals: secondary.get(account) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.directReferrals - a.directReferrals ||
        b.secondaryReferrals - a.secondaryReferrals,
    );

  const profileByAddress = await resolveProfiles(ranked.map((row) => row.account));

  return ranked
    .map((row) => {
      const profile = profileByAddress.get(row.account);
      return {
        account: row.account,
        total: row.directReferrals,
        username: profile?.username ?? undefined,
        userDisplayName: profile?.displayName ?? undefined,
        avatarUrl: profile?.avatarImageUrl ?? undefined,
        badgeBalance: profile?.badgeBalance ?? undefined,
        sentTips: 0,
        receivedTips: 0,
        followers: 0,
        likes: 0,
        directReferrals: row.directReferrals,
        secondaryReferrals: row.secondaryReferrals,
        isBanned: profile?.isBanned === true,
      };
    })
    // Every other category comes from `/api/leaderboard`, which leaves banned
    // accounts out of its own query. This one is ranked here, from referral
    // rows the API does not hold, so the ban has to be applied here too.
    .filter((entry) => !entry.isBanned)
    .map(({ isBanned: _isBanned, ...entry }) => entry);
}
