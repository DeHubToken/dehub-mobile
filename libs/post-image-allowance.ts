import { BADGE_ORDER, getBadgeName, parseBadgeLock } from "./misc";

export const MAX_IMAGE_UPLOAD_BYTES = 42_069_000;
export const MAX_REQUEST_IMAGE_BYTES = 100_000_000;

/**
 * Feed-image allowance per post. Creators without a badge get four images;
 * every badge holder gets at least 30, rising by tier to 40 for Megalodon.
 * Keep aligned with the backend's post-image-allowance.ts.
 */
const IMAGE_LIMITS_BY_BADGE_INDEX = [
  30, 30, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
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

/** Comics: 50 pages for any badge holder, 10 without. Matches the backend. */
export const COMIC_IMAGE_LIMIT = 50;
export const BASE_COMIC_IMAGE_LIMIT = 10;

export function getComicImageLimitForBadge(
  badgeBalance: number | string | null | undefined,
  username?: string | null,
  badgeLock?: unknown,
): number {
  const badge = getBadgeName(badgeBalance ?? 0, { username, lock: parseBadgeLock(badgeLock) });
  return badge ? COMIC_IMAGE_LIMIT : BASE_COMIC_IMAGE_LIMIT;
}

/**
 * Fallback media upload allowance before the API quota has loaded. Images,
 * video and audio share this ceiling. Keep it aligned with POST_QUOTA_TIERS.
 */
const MEDIA_GB_BY_BADGE_INDEX = [
  1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.5, 5, 10,
] as const;

export const BASE_POST_IMAGE_BYTES = 1024 ** 3;

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
  const gb = badgeIndex >= 0 ? MEDIA_GB_BY_BADGE_INDEX[badgeIndex] : undefined;

  return gb ? gb * 1024 ** 3 : BASE_POST_IMAGE_BYTES;
}
