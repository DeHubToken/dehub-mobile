/**
 * What each badge tier grants, in one list, for the badge showcase.
 *
 * Every number the app already enforces is read from the module that
 * enforces it. The fee and the editor storage have no mobile module of their
 * own; they mirror dehubweb `src/lib/badge-perks.ts` and
 * `src/lib/editor/quota.ts` — keep them in step.
 */
import { BADGE_ORDER, badgeThresholds } from "./misc";
import { getPostAllowanceForBadge } from "./postQuota";
import { engagementWeightForBadge } from "./engagement-weight";
import { getPostImageBytesForBadge, getPostImageLimitForBadge } from "./post-image-allowance";
import { getProfileAllowance } from "./profileLimits";

/** Fee on tips, pay-per-views, subscriptions and bounties with no badge. */
export const BASE_PLATFORM_FEE = 10;
/** Each rung climbed takes this much off the fee. */
export const FEE_STEP_PER_TIER = 0.69;
/** Megalodon's fee, rounded down from the 1.03 the step alone would give. */
export const TOP_TIER_PLATFORM_FEE = 1;
/** Tiers from here up clone voices for free. */
export const FREE_VOICE_CLONING_FROM = "Blue Whale";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
/** Editor media storage by tier index; mirrors web `lib/editor/quota.ts`. */
const EDITOR_STORAGE_BY_INDEX = [
  1 * GB, 2 * GB, 4 * GB, 8 * GB, 15 * GB, 25 * GB, 50 * GB,
  100 * GB, 200 * GB, 400 * GB, 750 * GB, 1536 * GB, 5 * 1024 * GB,
];
const EDITOR_STORAGE_BASELINE = 500 * MB;

/** Platform fee (percent) at a tier index; -1 is no badge. 10 → 9.31 → … → 1. */
export function platformFeeForIndex(index: number): number {
  if (index < 0) return BASE_PLATFORM_FEE;
  if (index >= BADGE_ORDER.length - 1) return TOP_TIER_PLATFORM_FEE;
  return Number((BASE_PLATFORM_FEE - (index + 1) * FEE_STEP_PER_TIER).toFixed(2));
}

export interface BadgePerks {
  /** Tier index, -1 for no badge. */
  index: number;
  tier: string | null;
  platformFee: number;
  voteWeight: number;
  /** What one view or reaction counts for. */
  reach: number;
  feedPostsPerDay: number;
  imagesPerPost: number;
  uploadBytesPerDay: number;
  editorStorageBytes: number;
  savedProfiles: number;
  lendingSlots: number;
  freeVoiceCloning: boolean;
}

/**
 * Perks at a tier index. The quota helpers resolve a balance, so each tier is
 * asked about at exactly its own threshold on the live ladder.
 */
export function badgePerksForIndex(index: number): BadgePerks {
  const ladder = badgeThresholds();
  const i = Math.max(-1, Math.min(index, BADGE_ORDER.length - 1));
  const tier = i >= 0 ? BADGE_ORDER[i] : null;
  const balance = i >= 0 ? ladder[i].min : 0;
  return {
    index: i,
    tier,
    platformFee: platformFeeForIndex(i),
    voteWeight: i + 1,
    reach: engagementWeightForBadge(tier),
    feedPostsPerDay: getPostAllowanceForBadge(balance).postsPerDay,
    imagesPerPost: getPostImageLimitForBadge(balance),
    uploadBytesPerDay: getPostImageBytesForBadge(balance),
    editorStorageBytes: i >= 0 ? EDITOR_STORAGE_BY_INDEX[i] : EDITOR_STORAGE_BASELINE,
    savedProfiles: getProfileAllowance([{ badgeBalance: balance }]).maxProfiles,
    lendingSlots: i + 1,
    freeVoiceCloning: i >= BADGE_ORDER.indexOf(FREE_VOICE_CLONING_FROM),
  };
}

/** Short byte count for a perk tile: 1.1 GB, 750 GB, 5 TB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${Number(n.toFixed(n >= 100 ? 0 : 1))} ${units[i]}`;
}
