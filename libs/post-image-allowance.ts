import { BADGE_ORDER, getBadgeName, parseBadgeLock } from "./misc";

/**
 * Feed-image allowance per post. The first four images are available to every
 * creator; higher badge tiers add room gradually, with Meglodon capped at 20.
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
