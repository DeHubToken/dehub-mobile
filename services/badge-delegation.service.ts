/**
 * Badge delegation — lending your tier to another account
 * =======================================================
 * A badge is a claim about influence, and influence can be lent. Every tier
 * carries one delegation slot per rung climbed (Crab 1, up to Meglodon 13),
 * and a slot hands your badge to another account — a second wallet, a backup,
 * or someone worth bringing up.
 *
 * Two things not obvious from the endpoints:
 *
 * **A delegation grants the rung below yours**, never your own. Slots scale
 * with tier, so granting at your own rung would get cheaper the higher you
 * climb, and the rarest badges would be the cheapest to counterfeit.
 *
 * **A lent badge renders exactly like an earned one, everywhere.** The server
 * folds it into `badgeBalance`, which every surface already reads, so no feed
 * card or chat row has to know a badge was lent in order to draw it. The one
 * place that does is the profile, which says whose badge it is.
 *
 * Mirrors web's `src/lib/api/dehub/badges.ts` — but note the paths differ by an
 * `/api` prefix. `env.API_URL` already ends in `/api`, so endpoints here are
 * written without it, the way every other service in this app writes them.
 * Copying a path across from web verbatim produces `/api/api/…`, which 404s on
 * every call.
 */

import { apiClient } from '../libs/api.client';

export interface DelegationEntry {
  /** Lower-cased wallet address of the other party. */
  address: string;
  /** Tier name, matching the badge art in `libs/misc`. */
  tier: string;
  since: string;
}

export interface BadgeDelegationSummary {
  address: string;
  /** What the chain says this account holds, before anything lent to it. */
  ownBadgeBalance: number;
  ownTier: string | null;
  /** Tier actually rendered — earned or lent. */
  effectiveTier: string | null;
  slots: number;
  /** Slots in use, counting ones still cooling down after a revoke. */
  slotsUsed: number;
  /** Tier this account may hand out, or null if it may not. */
  grantableTier: string | null;
  granted: DelegationEntry[];
  received: DelegationEntry | null;
}

export interface BadgePatron {
  tier: string;
  since: string;
  grantor: {
    address: string;
    username?: string | null;
    displayName?: string | null;
    avatarImageUrl?: string | null;
  } | null;
}

/** Slots, who is wearing this account's badge, and whose badge it is wearing. */
export async function fetchMyDelegations(): Promise<BadgeDelegationSummary> {
  const response = await apiClient.fetch<{ result: BadgeDelegationSummary }>(
    '/badge/delegations',
    { method: 'GET', isAuthRequired: true },
  );
  return response.result;
}

/**
 * Lend this account's badge to another.
 *
 * `to` is an address or a username — the server resolves either, so the input
 * can take whatever someone pastes.
 */
export async function grantDelegation(
  to: string,
): Promise<{ tier: string; slotsRemaining: number }> {
  const response = await apiClient.fetch<{ result: { tier: string; slotsRemaining: number } }>(
    '/badge/delegations',
    { method: 'POST', body: { to }, isAuthRequired: true },
  );
  return response.result;
}

/**
 * End a delegation with the named account, whichever end of it you are.
 *
 * One call for both directions: someone wearing a badge they would rather not
 * is not stuck waiting for the grantor to notice.
 */
export async function revokeDelegation(counterparty: string): Promise<void> {
  await apiClient.fetch<{ result: unknown }>(
    `/badge/delegations/${encodeURIComponent(counterparty)}`,
    { method: 'DELETE', isAuthRequired: true },
  );
}

/**
 * Who lent this account its badge, for the line on their profile.
 *
 * Public, and null for the overwhelming majority of accounts — a badge is
 * usually earned.
 */
export async function fetchBadgePatron(idOrAddress: string): Promise<BadgePatron | null> {
  const response = await apiClient.fetch<{ result: BadgePatron | null }>(
    `/badge/delegations/${encodeURIComponent(idOrAddress)}`,
    { method: 'GET', isAuthRequired: false },
  );
  return response?.result ?? null;
}
