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
interface BadgeDef {
  name: string;
  min: number; // minimum holdings required to earn this badge
}

// Ordered ascending by min threshold.
// Each amount is the *minimum* DHB holdings required for that badge.
// Users with < 10,000 DHB get NO badge.
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

/**
 * Get badge name for a given staking/holdings amount.
 * Returns the highest badge whose min threshold the user meets.
 * Returns undefined if holdings < 10,000 (no badge).
 */
export function getBadgeName(stakingAmount: number | string): string | undefined {
  const amt =
    typeof stakingAmount === "string"
      ? parseFloat(stakingAmount)
      : stakingAmount;
  if (!Number.isFinite(amt) || amt < BADGE_LEVELS[0].min) return undefined;
  let matched: string | undefined;
  for (const badge of BADGE_LEVELS) {
    if (amt >= badge.min) matched = badge.name;
    else break;
  }
  return matched;
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
): number | undefined {
  const badge = getBadgeName(stakingAmount);
  return badge ? BADGE_IMAGES[badge] : undefined;
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
  resolveBadgeBalance,
  getDefaultBanner,
  getExtension,
  buildImageUrl,
  getImageUrlApi,
  getImageUrlApiSimple,
  shareProfile,
};
export default Misc;
