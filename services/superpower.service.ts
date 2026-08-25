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
  tokenId: number;
  power: SuperPowerKey;
  startsAt: string;
  endsAt: string;
  minutes: number;
  /** Tier at booking time, frozen — not necessarily the tier worn now. */
  tier: string;
  status: 'active' | 'completed' | 'cancelled';
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
): Promise<SuperPowerBooking> {
  const response = await apiClient.fetch<{ result: SuperPowerBooking }>('/superpowers/boost', {
    method: 'POST',
    body: startAt ? { tokenId, power, startAt } : { tokenId, power },
    isAuthRequired: true,
  });
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
