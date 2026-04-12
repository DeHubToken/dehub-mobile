import env from "../config/env";
import { Share, Platform } from "react-native";

export function getAvatarUrl(url: string | undefined | null): string {
  if (!url) return "default-avatar"; // handled by Image source resolver with local asset mapping
  const fileName = url.split("/").pop();
  const base = `${env.CDN_BASE_URL}/avatars/${fileName}`;
  // TODO: Remove this cache busting mechanism later
  const perHalfHourKey  = Math.floor(Date.now() / (30 * 60 * 1000));
  const join = base.includes("?") ? "&" : "?";
  // return `${base}${join}v=${perHalfHourKey}`;
  return `${base}`;
}

export function getCoverUrl(url: string | undefined | null): string {
  if (!url) return "default-banner";
  const fileName = url.split("/").pop();
  return `${env.CDN_BASE_URL}/covers/${fileName}`;
}

export function buildCdnPath(path?: string | null): string | undefined {
  if (!path) return undefined;
  return `${env.CDN_BASE_URL}/${path}`;
}

// Build standard video URL from tokenId (supports number | string). Returns undefined if invalid.
export function getVideoUrl(tokenId?: string | number | null): string | undefined {
  if (tokenId === null || tokenId === undefined) return undefined;
  const id = typeof tokenId === 'number' ? tokenId.toString() : tokenId.trim();
  if (!id) return undefined;
  return `${env.CDN_BASE_URL}/videos/${id}.mp4`;
}

export function getShortsThumbnailUrl(tokenId?: string | number | null): string | undefined {
  if (tokenId === null || tokenId === undefined) return undefined;
  const id = typeof tokenId === 'number' ? tokenId.toString() : tokenId.trim();
  if (!id) return undefined;
  return `${env.CDN_BASE_URL}/shorts/${id}.jpg`;
}

export function getPreviewUrl(tokenId?: string | number | null): string | undefined {
  if (tokenId === null || tokenId === undefined) return undefined;
  const id = typeof tokenId === 'number' ? tokenId.toString() : tokenId.trim();
  if (!id) return undefined;
  return `${env.CDN_BASE_URL}/previews/${id}.mp4`;
}

export function resolveThumbnail(obj: Record<string, any>): string | undefined {
  const raw = obj.thumbnail || obj.thumbnailUrl || obj.imageUrl;
  return raw ? `${env.CDN_BASE_URL}/${raw}` : "default-banner";
}

// Generic image URL builder with optional resize query params
const baseUrlWithoutSlash = (env.CDN_BASE_URL ?? "").replace(/\/+$/, "");
export function getImageUrl(
  url: string,
  width?: number,
  height?: number
): string {
  if (!url) return "";
  const fileName = url.split("/").pop();
  const protocol = url.split(":")[0];
  const q = width && height ? `?w=${width}&h=${height}` : "";
  if (protocol === "http" || protocol === "https") return url + q;
  try {
    // return `${baseUrlWithoutSlash}/images/${fileName}${q}`;
    return `${baseUrlWithoutSlash}/images/${fileName}`;
  } catch {
    return url + q;
  }
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
): string {
  if (!apiImagePath) return '';
  if (apiImagePath.startsWith('http')) return apiImagePath;
  const ext = getExtension(apiImagePath);
  return `${baseUrlWithoutSlash}/images/${tokenId}.${ext}`;
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

const DEFAULT_BANNERS = [
  require("../assets/banners/1.png"),
  require("../assets/banners/2.png"),
  require("../assets/banners/3.png"),
  require("../assets/banners/4.png"),
  require("../assets/banners/5.png"),
  require("../assets/banners/6.png"),
  require("../assets/banners/7.png"),
  require("../assets/banners/8.png"),
  require("../assets/banners/9.png"),
  require("../assets/banners/10.png"),
  require("../assets/banners/11.png"),
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
