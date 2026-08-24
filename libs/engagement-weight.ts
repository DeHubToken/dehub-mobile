/**
 * What a badge is worth on a view and on a reaction
 * =================================================
 * A badge decides how much one person's attention counts. No badge counts
 * once, the entry tier twice, and every rung after that adds one: Crab 2,
 * Lobster 3, up to Meglodon 14.
 *
 * It is a MULTIPLIER, never a second reaction. One person still holds one
 * reaction and still counts as one unique viewer — the badge only changes what
 * that one is worth.
 *
 * **The server is the authority.** This exists so an optimistic count moves by
 * the right amount instead of by one and then snapping. `/request_vote` and
 * `/request_reaction` both return the `weight` they actually applied; prefer
 * that number where it can be read, because the server prices from the
 * account's EARNED balance and this side cannot see the earned/lent split.
 *
 * Keep in step with `dehub-stream-backend/src/badge/engagement-weight.ts` and
 * `dehubweb/src/lib/engagement-weight.ts`.
 *
 * @module libs/engagement-weight
 */

import { BADGE_ORDER, getBadgeName, type BadgeContext } from "./misc";

/** What an account with no badge contributes. Everybody counts at least once. */
export const NO_BADGE_ENGAGEMENT_WEIGHT = 1;

/** Meglodon: thirteen rungs above a badgeless account's single count. */
export const MAX_ENGAGEMENT_WEIGHT =
  BADGE_ORDER.length + NO_BADGE_ENGAGEMENT_WEIGHT;

/**
 * Weight for a named tier. An unknown or absent tier weighs one — a badge this
 * side does not recognise must not be worth more than one that is.
 */
export function engagementWeightForBadge(
  badgeName: string | null | undefined,
): number {
  if (!badgeName) return NO_BADGE_ENGAGEMENT_WEIGHT;
  const index = BADGE_ORDER.indexOf(badgeName);
  if (index < 0) return NO_BADGE_ENGAGEMENT_WEIGHT;
  return Math.min(
    MAX_ENGAGEMENT_WEIGHT,
    index + 1 + NO_BADGE_ENGAGEMENT_WEIGHT,
  );
}

/**
 * Weight for a balance, resolved through the same ladder (and the same
 * grandfathering lock) that draws the badge.
 */
export function engagementWeight(
  badgeBalance: number | string | null | undefined,
  context?: BadgeContext,
): number {
  if (badgeBalance === null || badgeBalance === undefined) {
    return NO_BADGE_ENGAGEMENT_WEIGHT;
  }
  return engagementWeightForBadge(getBadgeName(badgeBalance, context));
}

/** A weight read off an API response, clamped into the ladder. */
export function appliedEngagementWeight(raw: unknown): number {
  const value = typeof raw === "string" ? parseFloat(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return NO_BADGE_ENGAGEMENT_WEIGHT;
  }
  const floored = Math.floor(value);
  if (floored < NO_BADGE_ENGAGEMENT_WEIGHT) return NO_BADGE_ENGAGEMENT_WEIGHT;
  return Math.min(MAX_ENGAGEMENT_WEIGHT, floored);
}

/** "×3", for the surfaces that tell somebody what their badge is doing. */
export function formatEngagementWeight(weight: number): string {
  return `×${Math.max(NO_BADGE_ENGAGEMENT_WEIGHT, Math.floor(weight) || 1)}`;
}
