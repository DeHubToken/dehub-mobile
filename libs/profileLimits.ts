/**
 * How many profiles one device may keep signed in at once, from the DHB
 * staking badge tier.
 *
 * Mirror of web's `src/lib/profile-limits.ts`. Two with no badge, and one more
 * for every tier above it — 2 (no badge) -> 3 (Crab) -> ... -> 15 (Meglodon),
 * in the same order as `BADGE_ORDER` in `libs/misc.ts`. Adding a tier there
 * adds a slot here automatically; do not hand-write the numbers. Same shape and
 * same rule as the daily feed allowance in `libs/postQuota.ts`.
 *
 * The limit is read from the BEST tier on the device, not from whichever
 * profile happens to be active. A device's profiles belong to one person, and
 * pricing the list off the active account would mean switching to a fresh alt
 * silently dropped the limit below the number already saved — which reads as
 * the app losing accounts rather than as a tier rule.
 */
import { BADGE_ORDER, getBadgeName } from "./misc";
import { overrideTierNameFor } from "./badgeOverrides";

/** Profiles a device with no staking badge may keep. */
export const BASELINE_PROFILES = 2;

/**
 * Storage backstop, independent of the tier maths: the most any tier can
 * unlock. Nothing but a corrupted list should ever reach it.
 */
export const MAX_PROFILES_CEILING = BASELINE_PROFILES + BADGE_ORDER.length;

export interface ProfileAllowance {
  /** Profiles that may be saved on this device at once. */
  maxProfiles: number;
  /** Badge tier the allowance came from, or "Starter" with no badge. */
  tierName: string;
  isBaseline: boolean;
  /** What the next tier up would allow, or null at the top. */
  nextTierName: string | null;
  nextTierProfiles: number | null;
}

export interface BadgeHolder {
  badgeBalance?: number | string | null;
  username?: string | null;
}

function allowanceForIndex(index: number): ProfileAllowance {
  const maxProfiles = BASELINE_PROFILES + index + 1;
  const nextTierName = BADGE_ORDER[index + 1] ?? null;
  return {
    maxProfiles,
    tierName: BADGE_ORDER[index] ?? "Starter",
    isBaseline: index < 0,
    nextTierName,
    nextTierProfiles: nextTierName ? maxProfiles + 1 : null,
  };
}

/** Tier index for one holder; -1 when they hold no badge. */
function tierIndex(holder: BadgeHolder): number {
  const badge =
    overrideTierNameFor(holder.username) ??
    (holder.badgeBalance !== undefined && holder.badgeBalance !== null
      ? getBadgeName(holder.badgeBalance)
      : undefined);
  return badge ? BADGE_ORDER.indexOf(badge) : -1;
}

/** The allowance for a whole device: the best tier any saved profile holds. */
export function getProfileAllowance(holders: BadgeHolder[]): ProfileAllowance {
  // index -1 (nobody holds a badge) lands on the baseline; every tier adds one.
  return allowanceForIndex(holders.reduce((best, h) => Math.max(best, tierIndex(h)), -1));
}
