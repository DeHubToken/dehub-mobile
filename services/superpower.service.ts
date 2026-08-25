/**
 * SuperPowers — spending a badge on reach
 * =======================================
 * A badge buys quiet things: a cheaper DHB rate, a bigger posting allowance,
 * more weight on a reaction. SuperPowers is the loud half. Every holder gets an
 * allowance of boosts each fortnight, and a boost puts one of their posts in
 * the slot at the top of the home feed.
 *
 * Thirteen tiers, thirteen powers, one unlock per rung. Two are built: **Boost**
 * for a post under a week old, and **Second Wind** for anything older, which
 * unlocks a rung up because bringing something back from the archive is a
 * different act from amplifying what you just posted.
 *
 * **The slot rotates; it is not a pin.** A fortnight is 20,160 minutes and the
 * ladder hands out more than that as soon as a few thousand badges exist. When
 * several boosts are live the viewer is dealt one weighted by the booster's
 * tier. The promise is "thirty minutes at the top", which holds; what varies is
 * share of voice. Never write copy that promises sole possession of the slot.
 *
 * Mirrors web's `src/lib/api/dehub/superpowers.ts` — but note the paths differ
 * by an `/api` prefix. `env.API_URL` already ends in `/api`, so endpoints here
 * are written without it, the way every other service in this app writes them.
 * Copying a path across from web verbatim produces `/api/api/…`, which 404s on
 * every call.
 */

import { apiClient } from '../libs/api.client';
import { getAuthToken } from '../libs/auth.utils';

/** Keys are stable and stored on bookings; renaming one is a migration. */
export type SuperPowerKey =
  | 'boost'
  | 'second_wind'
  | 'comment_anchor'
  | 'trend_jacker'
  | 'timeline_bomber'
  | 'signal_flare'
  | 'flak_jacket'
  | 'precision_strike'
  | 'harpoon'
  | 'golden_hour'
  | 'crew_boost'
  | 'front_row'
  | 'deep_current';

export interface SuperPowerInfo {
  key: SuperPowerKey;
  label: string;
  summary: string;
  /** Badge tier this unlocks at, matching the art in `libs/misc`. */
  tier: string;
  /** False while a power is published but not yet built. */
  available: boolean;
  /** Whether this account's tier reaches it. Absent on the public ladder. */
  unlocked?: boolean;
}

export interface SuperPowerBooking {
  id: string;
  /**
   * Null for a power that does not act on a post — a Golden Hour acts on the
   * whole account. Check before navigating to a post.
   */
  tokenId: number | null;
  power: SuperPowerKey;
  startsAt: string;
  endsAt: string;
  minutes: number;
  /** Tier at booking time, frozen — not necessarily the tier worn now. */
  tier: string;
  status: 'active' | 'completed' | 'cancelled';
  /** The stage a Front Row is lifting. Null for every other power. */
  stageId?: string | null;
  /** The category a Trend Jacker is lifting. Null for every other power. */
  category?: string | null;
  /** Who else has put a boost behind this one, for a Crew Boost. */
  contributors?: { address: string; tier: string; minutes: number }[];
  /**
   * Whose post it landed on.
   *
   * The holder's own address for every power but Deep Current, which is a
   * gift. Optional for the same deploy-skew reason as the flare counters.
   */
  beneficiary?: string;
  /** Times this boost has been dealt to a viewer. */
  served: number;
  live: boolean;
}

export interface SuperPowerStatus {
  cycle: number;
  cycleStartedAt: string;
  /** When the next allowance lands. The same moment for everybody. */
  cycleEndsAt: string;
  cycleDays: number;
  tier: string | null;
  /** Earned balance the tier came from — a lent badge does not count here. */
  badgeBalance: number;
  boostsPerCycle: number;
  boostsUsed: number;
  boostsLeft: number;
  /**
   * The Signal Flare pot — a SECOND allowance the same size as the boost one,
   * spent independently.
   *
   * Optional because the app can be newer or older than the API it is talking
   * to, and the fallback has to be the boost count rather than zero: telling
   * an Octopus "no flares left" on a deploy skew takes the power away.
   */
  signalsPerCycle?: number;
  signalsUsed?: number;
  signalsLeft?: number;
  minutesPerBoost: number;
  /** Share of the slot when several boosts run at once. */
  slotWeight: number;
  powers: SuperPowerInfo[];
  bookings: SuperPowerBooking[];
}

export interface SuperPowerTierRow {
  name: string | null;
  minBadgeBalance: number;
  boostsPerCycle: number;
  minutesPerBoost: number;
  slotWeight: number;
}

export interface SuperPowerLadder {
  cycleDays: number;
  cycleEndsAt: string;
  tiers: SuperPowerTierRow[];
  powers: SuperPowerInfo[];
}

/** The stage holding the front row, or null when nothing is running. */
export interface FrontRow {
  stageId: string;
  bookingId: string;
  tier: string;
  endsAt: string;
}

export interface BoostSlot {
  tokenId: number;
  bookingId: string;
  power: SuperPowerKey;
  tier: string;
  endsAt: string;
  booster: string;
}

/** This account's tier, allowance and bookings. */
export async function fetchSuperpowerStatus(): Promise<SuperPowerStatus> {
  const response = await apiClient.fetch<{ result: SuperPowerStatus }>('/superpowers', {
    method: 'GET',
    isAuthRequired: true,
  });
  return response.result;
}

/** The published ladder. Public — no badge needed to read what one buys. */
export async function fetchSuperpowerTiers(): Promise<SuperPowerLadder> {
  const response = await apiClient.fetch<{ result: SuperPowerLadder }>('/superpowers/tiers', {
    method: 'GET',
    // `isAuthRequired` defaults to TRUE on this client. The ladder is public and
    // the whole point is that it reads before you hold a badge, so it has to be
    // turned off explicitly or a signed-out viewer never sees it.
    isAuthRequired: false,
  });
  return response.result;
}

/**
 * The boosted post to show this viewer, or null when nothing is running.
 *
 * Each call is an independent weighted draw, so the cache window on the caller
 * *is* the rotation: cache for five minutes and a viewer sees one boost per
 * refresh. Do not cache it for the session.
 */
export async function fetchBoostSlot(): Promise<BoostSlot | null> {
  const token = await getAuthToken();
  const response = await apiClient.fetch<{ result: BoostSlot | null }>('/superpowers/slot', {
    method: 'GET',
    // Not required, but SENT when there is one.
    //
    // `isAuthRequired: false` on this client does not merely relax the
    // requirement — it omits the header entirely. The server reads the token
    // on this endpoint for three things: to avoid dealing somebody their own
    // boost, to apply their block list, and to apply their mature-content
    // setting. Without it a holder was shown their own boost at the top of
    // their own feed, burning an impression on the one person it cannot reach.
    //
    // A signed-out viewer still gets the slot — that is most of the audience on
    // a shared link — and `getAuthToken` simply returns nothing for them.
    isAuthRequired: !!token,
  });
  return response.result ?? null;
}

/**
 * Spend a boost on one of your posts.
 *
 * `power` must suit the post's age — Boost under a week, Second Wind over it.
 * The server refuses the wrong one rather than silently correcting it, because
 * the two cost the same boost and mean different things.
 */
export async function bookBoost(
  tokenId: number,
  power: SuperPowerKey = 'boost',
  startAt?: string,
  aim?: {
    /** `precision_strike` — the account whose followers to reach. */
    targetAccount?: string;
    /** `harpoon` — badge tier NAMES, never balances. The ladder is dollar-pegged. */
    targetTiers?: string[];
    /** `comment_anchor` — YOUR comment, in somebody else's thread. */
    commentId?: string;
    /** `front_row` — a Stage you host, live or scheduled. */
    stageId?: string;
    /** `trend_jacker` — a category you already post in. */
    category?: string;
  },
): Promise<SuperPowerBooking> {
  const body: Record<string, unknown> = { tokenId, power };
  if (startAt) body.startAt = startAt;
  if (aim?.targetAccount) body.targetAccount = aim.targetAccount;
  if (aim?.targetTiers?.length) body.targetTiers = aim.targetTiers;
  if (aim?.commentId) body.commentId = aim.commentId;
  if (aim?.stageId) body.stageId = aim.stageId;
  if (aim?.category) body.category = aim.category;

  const response = await apiClient.fetch<{ result: SuperPowerBooking }>('/superpowers/boost', {
    method: 'POST',
    body,
    isAuthRequired: true,
  });
  return response.result;
}

/**
 * Which stage tops the stages rail right now.
 *
 * Public — a stage is public by construction, so there is nothing here to gate
 * on a viewer. Its own read rather than part of `/superpowers/slot`, because
 * that one deals a POST and this deals a stage id from another database.
 */
export async function fetchFrontRow(): Promise<FrontRow | null> {
  const response = await apiClient.fetch<{ result: FrontRow | null }>('/superpowers/front-row', {
    method: 'GET',
    isAuthRequired: false,
  });
  return response.result ?? null;
}

/**
 * Put one of your boosts behind somebody else's Crew Boost.
 *
 * Minutes pool; weight does not — the leader's tier still decides how often
 * the slot is dealt. Never write copy promising a joiner more reach: what they
 * buy is a longer window for the post they are backing.
 */
export async function joinCrewBoost(bookingId: string): Promise<SuperPowerBooking> {
  const response = await apiClient.fetch<{ result: SuperPowerBooking }>(
    `/superpowers/boost/${encodeURIComponent(bookingId)}/join`,
    { method: 'POST', isAuthRequired: true },
  );
  return response.result;
}

/**
 * Cancel a boost.
 *
 * `refunded` is false once the window has opened — a boost that has been in the
 * slot has been seen, and giving it back would make a fifteen-minute allowance
 * an unlimited one in five-second pieces. Say which happened rather than
 * reporting a flat success.
 */
export async function cancelBoost(bookingId: string): Promise<{ refunded: boolean }> {
  const response = await apiClient.fetch<{ result: { refunded: boolean } }>(
    `/superpowers/boost/${encodeURIComponent(bookingId)}`,
    { method: 'DELETE', isAuthRequired: true },
  );
  return response.result;
}

/**
 * Which power a post of this age needs, or null if it cannot be boosted.
 *
 * The server enforces the same line and its refusal is the authority; this is
 * so the sheet can label the button correctly rather than making someone press
 * it to find out.
 */
export function powerForPostAge(createdAt: string | Date | undefined): SuperPowerKey | null {
  if (!createdAt) return null;
  const age = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 'boost';
  return age > 7 * 24 * 60 * 60 * 1000 ? 'second_wind' : 'boost';
}

// Refusals carry the server's own sentence — "That post is over a week old —
// use Second Wind to bring it back", "You have used all 2 of your boosts this
// cycle". Show it. Mapping it back to a code to look up a second wording only
// gives the two places to disagree.

/** What a power needs from the holder before it can be spent. */
export type PowerTargeting = 'none' | 'account' | 'tiers';

export interface SpendablePower {
  key: SuperPowerKey;
  label: string;
  summary: string;
  /** What the holder must supply — an account to aim at, or badge tiers. */
  targeting: PowerTargeting;
  /** False when the tier does not reach it, or it is not built yet. */
  enabled: boolean;
  /** Why it is disabled, written for the holder. Empty when enabled. */
  blockedReason: string;
}

/**
 * Every power this holder could spend on this post, in ladder order.
 *
 * Mirror of web's `spendablePowers`. Replaces the age-derived either/or the
 * sheet started with: that was right while Boost and Second Wind were the only
 * two — they split one job by age — but four of the six built have nothing to
 * do with age, and inferring one silently hides the rest.
 *
 * `status.powers` is the authority for what is unlocked and what is built,
 * never a table on this side. The client draws a badge from a live read that
 * deliberately over-reports, so a local answer would offer powers the server
 * will refuse.
 */
export function spendablePowers(
  status: SuperPowerStatus | null | undefined,
  postCreatedAt: string | Date | undefined,
  /**
   * Whether the viewer wrote this post.
   *
   * Undefined means "not resolved yet", and nothing is filtered on it — the
   * server still refuses, which is the authority either way. Passing it is
   * what turns a refusal into a list the holder can read before they tap.
   */
  isOwnPost?: boolean,
): SpendablePower[] {
  if (!status) return [];

  const ageChoice = powerForPostAge(postCreatedAt);
  const TARGETING: Partial<Record<SuperPowerKey, PowerTargeting>> = {
    precision_strike: 'account',
    harpoon: 'tiers',
  };

  // Deep Current is the only gift on the ladder, and it is the exact inverse
  // of every other power rather than an addition to them — offering it on
  // your own post, or a Boost on a stranger's, produces a tap the server
  // refuses with a sentence the holder could have been shown first.
  const GIFTS: readonly SuperPowerKey[] = ['deep_current'];

  // Signal Flare comes out of a second allowance the same size as the boost
  // one. Reading boostsLeft for it tells an Octopus who has spent both boosts
  // that they have no flares either.
  const SIGNALS: readonly SuperPowerKey[] = ['signal_flare'];
  const left = (key: SuperPowerKey) =>
    SIGNALS.includes(key) ? (status.signalsLeft ?? status.boostsLeft) : status.boostsLeft;

  return status.powers
    .filter(p => {
      if (!p.available) return false;
      // Golden Hour acts on the account, not this post — it belongs on the
      // SuperPowers screen rather than in a post's sheet.
      if (p.key === 'golden_hour') return false;
      // A gift is offered only on somebody else's post, and everything else
      // only on your own. Unknown ownership hides nothing.
      if (isOwnPost !== undefined) {
        if (GIFTS.includes(p.key) !== !isOwnPost) return false;
      }
      // Only the age-appropriate half of the Boost/Second Wind pair.
      if (p.key === 'boost' || p.key === 'second_wind') return p.key === ageChoice;
      return true;
    })
    .map(p => ({
      key: p.key,
      label: p.label,
      summary: p.summary,
      targeting: TARGETING[p.key] ?? 'none',
      enabled: !!p.unlocked && left(p.key) > 0,
      blockedReason: !p.unlocked
        ? `Unlocks at ${p.tier}`
        : left(p.key) < 1
          ? SIGNALS.includes(p.key)
            ? 'No Signal Flares left this cycle'
            : 'No boosts left this cycle'
          : '',
    }));
}
