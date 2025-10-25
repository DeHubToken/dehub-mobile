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

export function resolveThumbnail(obj: Record<string, any>): string | undefined {
  const raw = obj.thumbnail || obj.thumbnailUrl || obj.imageUrl;
  return raw ? `${env.CDN_BASE_URL}/${raw}` : "default-banner";
}

// Generic image URL builder with optional resize query params
const baseUrlWithoutSlash = env.CDN_BASE_URL.replace(/\/+$/, "");
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

// Badge utilities ---------------------------------------------------------
interface BadgeDef {
  name: string;
  min: number;
}
// Ordered ascending by min stake requirement
const BADGE_LEVELS: BadgeDef[] = [
  { name: "Tortoise", min: 0 },
  { name: "Crab", min: 100 },
  { name: "Piranha", min: 250 },
  { name: "Lobster", min: 500 },
  { name: "Octopus", min: 1000 },
  { name: "Cobra", min: 2500 },
  { name: "Crocodite", min: 5000 },
  { name: "Dolphin", min: 7500 },
  { name: "Tiger Shark", min: 10000 },
  { name: "Great White Shark", min: 15000 },
  { name: "Killer Whale", min: 25000 },
  { name: "Blue Whale", min: 50000 },
  { name: "Meglodon", min: 100000 },
];

export function getBadgeName(stakingAmount: number | string): string {
  const amt =
    typeof stakingAmount === "string"
      ? parseFloat(stakingAmount)
      : stakingAmount;
  if (!Number.isFinite(amt)) return BADGE_LEVELS[0].name;
  let current = BADGE_LEVELS[0].name;
  for (const b of BADGE_LEVELS) {
    if (amt >= b.min) current = b.name;
    else break;
  }
  return current;
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

export function getBadgeUrl(
  stakingAmount: number | string,
  theme: "light" | "dark" = "light"
): number | undefined {
  const badge = getBadgeName(stakingAmount);
  return BADGE_IMAGES[badge];
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
  getVideoUrl,
  getBadgeUrl,
  getBadgeName,
  getImageUrlApi,
  getImageUrlApiSimple,
  shareProfile,
};
export default Misc;
