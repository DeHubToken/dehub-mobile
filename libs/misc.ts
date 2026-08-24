import env from "../config/env";
import { Share, Platform } from "react-native";
import { cdnImage } from "./cdnImage";

/**
 * Default avatar request size, in CSS points. Every avatar in this app renders
 * between 20pt (comment rows) and 44pt (feed card header), so a single default
 * covers all 60-odd call sites; the larger ones (profile header, user sheet)
 * pass their own. See libs/cdnImage.ts for why sizing is opt-in everywhere else.
 */
const DEFAULT_AVATAR_PT = 48;

export function getAvatarUrl(
  url: string | undefined | null,
  /** Rendered size in CSS points. Pass 0 for the untouched original. */
  sizePt: number = DEFAULT_AVATAR_PT,
): string {
  if (!url) return "default-avatar"; // handled by Image source resolver with local asset mapping
  const fileName = url.split("/").pop();
  const base = `${env.CDN_BASE_URL}/avatars/${fileName}`;
  return cdnImage(base, { width: sizePt });
}

export function getCoverUrl(
  url: string | undefined | null,
  /** Rendered width in CSS points. Omit for the untouched original. */
  widthPt?: number,
): string {
  if (!url) return "default-banner";
  const fileName = url.split("/").pop();
  return cdnImage(`${env.CDN_BASE_URL}/covers/${fileName}`, { width: widthPt });
}

export function buildCdnPath(path?: string | null): string | undefined {
  if (!path) return undefined;
  return `${env.CDN_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

// Build standard video URL from tokenId (supports number | string). Returns undefined if invalid.
export function getVideoUrl(tokenId?: string | number | null): string | undefined {
  if (tokenId === null || tokenId === undefined) return undefined;
  const id = typeof tokenId === 'number' ? tokenId.toString() : tokenId.trim();
  if (!id) return undefined;
  return `${env.CDN_BASE_URL}/videos/${id}.mp4`;
}

export function getShortsThumbnailUrl(
  tokenId?: string | number | null,
  /** Rendered width in CSS points. Omit for the untouched original. */
  widthPt?: number,
): string | undefined {
  if (tokenId === null || tokenId === undefined) return undefined;
  const id = typeof tokenId === 'number' ? tokenId.toString() : tokenId.trim();
  if (!id) return undefined;
  return cdnImage(`${env.CDN_BASE_URL}/shorts/${id}.jpg`, { width: widthPt });
}

export function getPreviewUrl(tokenId?: string | number | null): string | undefined {
  if (tokenId === null || tokenId === undefined) return undefined;
  const id = typeof tokenId === 'number' ? tokenId.toString() : tokenId.trim();
  if (!id) return undefined;
  return `${env.CDN_BASE_URL}/previews/${id}.mp4`;
}

/**
 * Returns `string`, not `string | undefined`. Both branches provably produce a
 * string — the signature said otherwise, and until now nothing caught it
 * because FeedCard's thumbnail chain also contained bare `any` returns, and one
 * `any` in a union collapses the whole union to `any`. Removing those (they are
 * now routed through cdnImage) made the phantom `undefined` visible.
 */
export function resolveThumbnail(
  obj: Record<string, any>,
  /** Rendered width in CSS points. Omit for the untouched original. */
  widthPt?: number,
): string {
  const raw = obj.thumbnail || obj.thumbnailUrl || obj.imageUrl;
  if (!raw) return "default-banner";
  return cdnImage(`${env.CDN_BASE_URL}/${raw}`, { width: widthPt });
}

const baseUrlWithoutSlash = (env.CDN_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Generic image URL builder.
 *
 * `width` is a request for a resized image, and it is now honoured. It used to
 * be accepted and thrown away: the CDN branch that appended `?w=&h=` was
 * commented out, so the two call sites that ask for 640x360 thumbnails
 * (Home/FeedCard, Home/CompactVideoCard) were served full-resolution originals
 * — which is the whole reason feed scrolling pulled megabytes it did not need.
 *
 * `width` is in CSS POINTS, not pixels; DPR is applied inside cdnImage. `height`
 * is accepted for call-site compatibility and intentionally unused — Cloudflare
 * preserves aspect ratio from width alone, and passing both would crop.
 */
export function getImageUrl(
  url: string,
  width?: number,
  _height?: number
): string {
  if (!url) return "";
  const fileName = url.split("/").pop();
  const protocol = url.split(":")[0];
  // Already absolute (external host, or an already-built CDN URL): cdnImage
  // decides for itself whether it owns that host.
  if (protocol === "http" || protocol === "https") return cdnImage(url, { width });
  return cdnImage(`${baseUrlWithoutSlash}/images/${fileName}`, { width });
}

/**
 * Extract file extension from an API path.
 * Preserves original extension including .octet-stream, .gif, .jpeg, etc.
 */
export function getExtension(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9-]+)$/);
  if (!match) return 'jpg';
  return match[1].toLowerCase();
}

/**
 * Build canonical image URL: cdn/images/{tokenId}.{ext}
 * API returns paths like "images/2008.jpg" or "nfts/images/61.jpeg"
 * We normalize to: CDN_BASE_URL/images/{tokenId}.{ext}
 */
export function buildImageUrl(
  tokenId: number | string,
  apiImagePath: string | undefined | null,
  /** Rendered width in CSS points. Omit for the untouched original. */
  widthPt?: number,
): string {
  if (!apiImagePath) return '';
  if (apiImagePath.startsWith('http')) return cdnImage(apiImagePath, { width: widthPt });
  const ext = getExtension(apiImagePath);
  return cdnImage(`${baseUrlWithoutSlash}/images/${tokenId}.${ext}`, { width: widthPt });
}

// API image URL builders (for signed feed images) ---------------------------
export function getImageUrlApi(
  tokenId: string | number,
  address?: string,
  width?: number,
  height?: number
): string {
  const base = env.API_URL?.replace(/\/+$/, "") || "";
  const q = width && height ? `&w=${width}&h=${height}` : "";
  const addr = address ? String(address) : "";
  return `${base}/nfts/images/${+tokenId}?address=${encodeURIComponent(addr)}${q}`;
}

export function getImageUrlApiSimple(url: string): string {
  const base = env.API_URL?.replace(/\/+$/, "") || "";
  const path = url?.replace(/^\/+/, "");
  return `${base}/${path}`;
}

/**
 * Multi-image posts: cdn/feed-images/{filename}, resized. Mirrors web's
 * buildFeedImageUrls. These used to go through getImageUrlApiSimple — the raw
 * API origin — which served full-resolution originals with no resize and no
 * CDN cache: the exact cost the width plumbing above exists to avoid.
 */
export function buildFeedImageUrls(
  apiImageUrls: string[] | undefined | null,
  /** Rendered width in CSS points; DPR is applied inside cdnImage. */
  widthPt?: number,
): string[] {
  if (!apiImageUrls?.length) return [];
  return apiImageUrls.map((imgUrl) => {
    if (!imgUrl) return "";
    if (imgUrl.startsWith("http")) return cdnImage(imgUrl, { width: widthPt });
    const filename = imgUrl.split("/").pop() || "";
    return filename
      ? cdnImage(`${baseUrlWithoutSlash}/feed-images/${filename}`, { width: widthPt })
      : imgUrl;
  });
}

/** Resolve a relative audio path (e.g. "feed-audio/123-audio.audio") to a full CDN URL */
export function getAudioUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const path = url.replace(/^\/+/, "");
  return `${baseUrlWithoutSlash}/${path}`;
}

// Badge utilities ---------------------------------------------------------
//
// The ladder is pegged in DOLLARS, not in DHB. The table below is what each
// tier costs at `BADGE_PRICE_ANCHOR` ($0.001, which is also the price DHB is
// currently pinned to); the DHB requirement at any other price is that
// reference scaled by `anchor / price`. Meglodon stays about $50,000 of DHB
// whatever the token is worth — flat amounts would have closed the top of the
// ladder to everyone not already on it the moment DHB appreciated.
//
// Two limits on the scale: capped at 1, so a price below the anchor never
// demands MORE than the published numbers, and rounded to two significant
// figures so the ladder steps rather than chasing ticks.
//
// A tier once earned is not taken back by the price. `BadgeLock` — served by
// the API on the account row and on every feed item's `minterUser` — records
// the tier a holder reached and the DHB it cost them; they keep it while their
// balance covers that number.
//
// Mirror of web's `src/lib/staking-badges.ts` and the backend's
// `src/badge/badge-tiers.ts`. All three must agree: the app and the site draw
// the same badge, and the gateway prices its holder discount off the same tier.
interface BadgeDef {
  name: string;
  min: number; // DHB required at BADGE_PRICE_ANCHOR
}

// Ordered ascending by min threshold.
// Each amount is the *minimum* DHB holdings required for that badge at the
// anchor price. Users below the entry rung get NO badge.
const BADGE_LEVELS: BadgeDef[] = [
  { name: "Crab", min: 10_000 },
  { name: "Lobster", min: 25_000 },
  { name: "Piranha", min: 50_000 },
  { name: "Tortoise", min: 100_000 },
  { name: "Cobra", min: 250_000 },
  { name: "Octopus", min: 500_000 },
  { name: "Crocodite", min: 1_000_000 },
  { name: "Dolphin", min: 2_000_000 },
  { name: "Tiger Shark", min: 3_000_000 },
  { name: "Killer Whale", min: 5_000_000 },
  { name: "Great White Shark", min: 10_000_000 },
  { name: "Blue Whale", min: 25_000_000 },
  { name: "Meglodon", min: 50_000_000 },
];

/**
 * Tier names, lowest first. Mirrors web's `BADGE_ORDER` in
 * `src/lib/staking-badges.ts` — the index into this list is what
 * `libs/postQuota.ts` turns into a daily home-feed allowance, so the two lists
 * must stay in the same order.
 */
export const BADGE_ORDER: string[] = BADGE_LEVELS.map((b) => b.name);

/** The DHB price, in USD, the reference ladder was written against. */
export const BADGE_PRICE_ANCHOR = 0.001;

/** Ceiling on the scale — the ladder is never harder than the reference. */
export const MAX_BADGE_SCALE = 1;

/** Floor on the scale, at a $1 token: Crab 10 DHB, Meglodon 50,000 DHB. */
export const MIN_BADGE_SCALE = 0.001;

/** Round to `digits` significant figures without the float drift of x/÷. */
function significant(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Number(value.toPrecision(digits));
}

/**
 * The ladder scale a DHB price implies. An unreadable price returns 1 — the
 * reference ladder. A badge must never move because a price lookup failed.
 */
export function badgeScaleForPrice(
  price: number | string | null | undefined,
): number {
  const numeric = typeof price === "string" ? parseFloat(price) : price;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0) {
    return MAX_BADGE_SCALE;
  }
  const raw = significant(BADGE_PRICE_ANCHOR / numeric, 2);
  return Math.min(MAX_BADGE_SCALE, Math.max(MIN_BADGE_SCALE, raw));
}

/**
 * The scale used when a caller passes none.
 *
 * `getBadgeName` is called from feed mappers and quota maths with no hook in
 * reach, so the scale has to be readable without one. `useBadgeLadderSync`
 * publishes it; until then this is the reference ladder.
 */
let activeScale = MAX_BADGE_SCALE;

export function activeBadgeScale(): number {
  return activeScale;
}

export function setActiveBadgeScale(scale: number): number {
  const clamped = Math.min(MAX_BADGE_SCALE, Math.max(MIN_BADGE_SCALE, scale));
  activeScale = Number.isFinite(clamped) ? clamped : MAX_BADGE_SCALE;
  return activeScale;
}

const ladderCache = new Map<number, BadgeDef[]>();

/**
 * The live ladder: what each tier costs in DHB at `scale`.
 *
 * Thresholds are rounded to three significant figures so they read as prices,
 * then forced strictly ascending — a ladder that collapsed two tiers would
 * hand the lower one the higher one's allowance.
 */
export function badgeThresholds(scale: number = activeScale): BadgeDef[] {
  const key = Number.isFinite(scale) ? scale : MAX_BADGE_SCALE;
  const cached = ladderCache.get(key);
  if (cached) return cached;

  let previous = 0;
  const ladder = BADGE_LEVELS.map((level) => {
    const min = Math.max(1, previous + 1, significant(level.min * key, 3));
    previous = min;
    return { name: level.name, min };
  });

  if (ladderCache.size > 32) ladderCache.clear();
  ladderCache.set(key, ladder);
  return ladder;
}

/** DHB needed for `tier` at `scale`, or undefined for an unknown tier name. */
export function badgeThreshold(
  tier: string | null | undefined,
  scale: number = activeScale,
): number | undefined {
  if (!tier) return undefined;
  return badgeThresholds(scale).find((b) => b.name === tier)?.min;
}

/**
 * A tier a holder has already earned, and what it cost them.
 * Written by the API; tier up only, requirement down only.
 */
export interface BadgeLock {
  tier: string;
  requirement: number;
}

/** Everything other than the balance that decides which badge is drawn. */
export interface BadgeContext {
  scale?: number;
  lock?: BadgeLock | null;
}

/**
 * Read a lock out of an API payload. Anything malformed resolves to undefined
 * rather than throwing — a bad lock should cost a holder their grandfathering,
 * not the screen it rode in on.
 */
export function parseBadgeLock(raw: unknown): BadgeLock | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { tier, requirement } = raw as { tier?: unknown; requirement?: unknown };
  if (typeof tier !== "string" || BADGE_ORDER.indexOf(tier) < 0) return undefined;
  const amount =
    typeof requirement === "string" ? parseFloat(requirement) : requirement;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  return { tier, requirement: amount };
}

/** The tier a balance earns outright on the ladder at `scale`. */
function earnedTier(amount: number, scale: number): string | undefined {
  let matched: string | undefined;
  for (const badge of badgeThresholds(scale)) {
    if (amount >= badge.min) matched = badge.name;
    else break;
  }
  return matched;
}

/**
 * Get badge name for a given staking/holdings amount.
 *
 * Returns the highest badge the holder qualifies for on the live ladder, or
 * the tier their lock grandfathers if that is higher. Undefined below the
 * entry rung.
 */
export function getBadgeName(
  stakingAmount: number | string,
  context?: BadgeContext,
): string | undefined {
  const amt =
    typeof stakingAmount === "string"
      ? parseFloat(stakingAmount)
      : stakingAmount;
  if (!Number.isFinite(amt)) return undefined;

  const scale = context?.scale ?? activeScale;
  const earned = earnedTier(amt, scale);

  // A tier already earned is not taken back by the ladder moving under it —
  // only by the holder falling below what it cost them.
  const lock = parseBadgeLock(context?.lock);
  const locked = lock && amt >= lock.requirement ? lock.tier : undefined;

  const earnedIndex = earned ? BADGE_ORDER.indexOf(earned) : -1;
  const lockedIndex = locked ? BADGE_ORDER.indexOf(locked) : -1;
  return lockedIndex > earnedIndex ? locked : earned;
}

// Preload badge images (static requires; dynamic requires not supported by Metro)
const BADGE_IMAGES: Record<string, number> = {
  Tortoise: require("../assets/badges/Tortoise.png"),
  Crab: require("../assets/badges/Crab.png"),
  Piranha: require("../assets/badges/Piranha.png"),
  Lobster: require("../assets/badges/Lobster.png"),
  Octopus: require("../assets/badges/Octopus.png"),
  Cobra: require("../assets/badges/Cobra.png"),
  Crocodite: require("../assets/badges/Crocodite.png"),
  Dolphin: require("../assets/badges/Dolphin.png"),
  "Tiger Shark": require("../assets/badges/Tiger Shark.png"),
  "Great White Shark": require("../assets/badges/Great White Shark.png"),
  "Killer Whale": require("../assets/badges/Killer Whale.png"),
  "Blue Whale": require("../assets/badges/Blue Whale.png"),
  Meglodon: require("../assets/badges/Meglodon.png"),
};

// JPEG, not PNG. These are the placeholder cover strips behind a profile: they
// render into roughly 390x140pt, they carry no transparency (every one is
// rgb24), and they were shipping as 3000x1000 PNGs totalling 14.6 MB. Resized
// to 1200 wide and encoded to a >=40 dB luma PSNR floor they come to 0.84 MB.
const DEFAULT_BANNERS = [
  require("../assets/banners/1.jpg"),
  require("../assets/banners/2.jpg"),
  require("../assets/banners/3.jpg"),
  require("../assets/banners/4.jpg"),
  require("../assets/banners/5.jpg"),
  require("../assets/banners/6.jpg"),
  require("../assets/banners/7.jpg"),
  require("../assets/banners/8.jpg"),
  require("../assets/banners/9.jpg"),
  require("../assets/banners/10.jpg"),
  require("../assets/banners/11.jpg"),
];

export function getDefaultBanner(identifier: string = ""): number {
  if (!identifier) return DEFAULT_BANNERS[0];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DEFAULT_BANNERS.length;
  return DEFAULT_BANNERS[index];
}

export function getBadgeUrl(
  stakingAmount: number | string,
  context?: BadgeContext,
): number | undefined {
  const badge = getBadgeName(stakingAmount, context);
  return badge ? BADGE_IMAGES[badge] : undefined;
}

/** The badge art for a tier name, for surfaces that already know the tier. */
export function badgeImage(tier: string | null | undefined): number | undefined {
  return tier ? BADGE_IMAGES[tier] : undefined;
}

/**
 * The badge art for a user-like object — the balance and the lock read
 * together.
 *
 * Every card, chat row and leaderboard row used to write
 * `getBadgeUrl(resolveBadgeBalance(x))`, which finds the balance and misses
 * the lock. A grandfathered holder would then wear a lower badge on a feed
 * card than on their own profile. One call reads both.
 */
export function getBadgeUrlFor(
  userOrItem: Record<string, any> | null | undefined,
): number | undefined {
  return getBadgeUrl(resolveBadgeBalance(userOrItem), {
    lock: resolveBadgeLock(userOrItem),
  });
}

/** Where a holder sits on the ladder — the progress panel's data model. */
export interface BadgeStanding {
  tier?: string;
  image?: number;
  /** Index in `BADGE_ORDER`, -1 with no badge. */
  index: number;
  balance: number;
  currentThreshold: number;
  nextTier?: string;
  nextThreshold?: number;
  /** DHB still to buy for the next tier, 0 at the top. */
  remaining: number;
  /** Progress across the current tier, 0-1. 1 at the top. */
  progress: number;
  /** True when the tier is held on a lock rather than on the live ladder. */
  grandfathered: boolean;
}

/**
 * Resolve a holder's full standing.
 *
 * `progress` runs from the current rung to the next, not from zero — crawling
 * 2% of the way to Meglodon is not progress anyone can feel. Below the entry
 * rung it runs from zero to Crab.
 */
export function getBadgeStanding(
  badgeBalance: number | string | null | undefined,
  context?: BadgeContext,
): BadgeStanding {
  const scale = context?.scale ?? activeScale;
  const ladder = badgeThresholds(scale);
  const parsed =
    typeof badgeBalance === "string" ? parseFloat(badgeBalance) : badgeBalance;
  const balance =
    typeof parsed === "number" && Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

  const tier = getBadgeName(balance, context);
  const index = tier ? BADGE_ORDER.indexOf(tier) : -1;
  const currentThreshold = index >= 0 ? ladder[index].min : ladder[0].min;
  const next = index + 1 < ladder.length ? ladder[index + 1] : undefined;

  const floor = index >= 0 ? currentThreshold : 0;
  const span = next ? next.min - floor : 0;
  const progress = next
    ? Math.min(1, Math.max(0, (balance - floor) / (span || 1)))
    : 1;

  const earned = earnedTier(balance, scale);
  const earnedIndex = earned ? BADGE_ORDER.indexOf(earned) : -1;

  return {
    tier,
    image: tier ? BADGE_IMAGES[tier] : undefined,
    index,
    balance,
    currentThreshold,
    nextTier: next?.name,
    nextThreshold: next?.min,
    remaining: next ? Math.max(0, next.min - balance) : 0,
    progress,
    grandfathered: index >= 0 && index > earnedIndex,
  };
}

/**
 * Badge art for a tier named directly, rather than derived from a balance.
 *
 * Delegation talks in tier names — a slot lends "the Tiger Shark badge", and
 * the server says which one it granted — so those surfaces have a name in hand
 * and no balance to resolve it from. Mirrors web's `badgeImage`.
 */
export function badgeImageFor(tier: string | null | undefined): number | undefined {
  return tier ? BADGE_IMAGES[tier] : undefined;
}

/**
 * Resolve the badge balance from a user-like object.
 * Prefers `badgeBalance` (backend-computed) over `stakedDHB` / `staked` / `minterStaked`.
 */
export function resolveBadgeBalance(
  userOrItem: Record<string, any> | null | undefined
): number {
  if (!userOrItem) return 0;
  // Prefer the explicit badgeBalance field from backend
  if (typeof userOrItem.badgeBalance === "number" && userOrItem.badgeBalance > 0)
    return userOrItem.badgeBalance;
  // Fallback chain: stakedDHB → staked → minterStaked → balanceData max staked
  if (typeof userOrItem.stakedDHB === "number" && userOrItem.stakedDHB > 0)
    return userOrItem.stakedDHB;
  if (typeof userOrItem.staked === "number" && userOrItem.staked > 0)
    return userOrItem.staked;
  if (typeof userOrItem.minterStaked === "number" && userOrItem.minterStaked > 0)
    return userOrItem.minterStaked;
  return 0;
}

/**
 * Resolve the grandfathered tier from a user-like object.
 *
 * Feed rows carry the author under `minterUser` / `author`, so look one level
 * down as well as at the top — the lock rides the same account row the balance
 * does, and a card that finds the balance but not the lock would draw a tier
 * the profile screen does not.
 */
export function resolveBadgeLock(
  userOrItem: Record<string, any> | null | undefined,
): BadgeLock | undefined {
  if (!userOrItem) return undefined;
  return (
    parseBadgeLock(userOrItem.badgeLock) ??
    parseBadgeLock(userOrItem.minterUser?.badgeLock) ??
    parseBadgeLock(userOrItem.author?.badgeLock)
  );
}

/** Generic share helper.
 * Provide an already formatted message; will include url param on iOS automatically.
 */
export async function shareProfile(url: string, message: string) {
  if (!url || !message) return;
  try {
    await Share.share(
      Platform.select({
        ios: { message, url },
        default: { message },
      }) as any
    );
  } catch (e) {
    console.warn("[shareProfile] failed", e);
  }
}


export const Misc = {
  getAvatarUrl,
  getCoverUrl,
  buildCdnPath,
  resolveThumbnail,
  getImageUrl,
  getAudioUrl,
  getVideoUrl,
  getShortsThumbnailUrl,
  getPreviewUrl,
  getBadgeUrl,
  getBadgeName,
  badgeImage,
  badgeThresholds,
  getBadgeStanding,
  resolveBadgeBalance,
  resolveBadgeLock,
  getDefaultBanner,
  getExtension,
  buildImageUrl,
  getImageUrlApi,
  getImageUrlApiSimple,
  shareProfile,
};
export default Misc;
