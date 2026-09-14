import { BADGE_ORDER, getBadgeName, parseBadgeLock } from "./misc";

/**
 * Feed-image allowance per post. The first four images are available to every
 * creator; higher badge tiers add room gradually, with Megalodon capped at 20.
 */
const IMAGE_LIMITS_BY_BADGE_INDEX = [
  5, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20,
] as const;

export const BASE_POST_IMAGE_LIMIT = 4;

export function getPostImageLimitForBadge(
  badgeBalance: number | string | null | undefined,
  username?: string | null,
  badgeLock?: unknown,
): number {
  const badge = getBadgeName(badgeBalance ?? 0, {
    username,
    lock: parseBadgeLock(badgeLock),
  });
  const badgeIndex = badge ? BADGE_ORDER.indexOf(badge) : -1;

  return badgeIndex >= 0
    ? IMAGE_LIMITS_BY_BADGE_INDEX[badgeIndex] ?? BASE_POST_IMAGE_LIMIT
    : BASE_POST_IMAGE_LIMIT;
}

/**
 * How big a single picture may be, per badge tier — the size the API stores,
 * not just the size it accepts. A megabyte with no badge, one more per tier,
 * then a jump to 20 and 30 for Blue Whale and Megalodon.
 *
 * The API is the authority (PostQuotaStatus.imageBytes); this table is what
 * the composer uses before that has loaded, and against an older API. Keep it
 * in step with POST_QUOTA_TIERS in the backend.
 */
const IMAGE_MB_BY_BADGE_INDEX = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 30,
] as const;

export const BASE_POST_IMAGE_BYTES = 1024 * 1024;

export function getPostImageBytesForBadge(
  badgeBalance: number | string | null | undefined,
  username?: string | null,
  badgeLock?: unknown,
): number {
  const badge = getBadgeName(badgeBalance ?? 0, {
    username,
    lock: parseBadgeLock(badgeLock),
  });
  const badgeIndex = badge ? BADGE_ORDER.indexOf(badge) : -1;
  const mb = badgeIndex >= 0 ? IMAGE_MB_BY_BADGE_INDEX[badgeIndex] : undefined;

  return mb ? mb * 1024 * 1024 : BASE_POST_IMAGE_BYTES;
}
