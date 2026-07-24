import { buildImageUrl, getImageUrl, getImageUrlApiSimple } from "./misc";
import type { UserReplyPost } from "../services/user.service";

const UNTITLED = "untitled";
const VISUAL_POST_TYPES = new Set(["feed-images", "image", "video", "short"]);

function cleanText(value?: string | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isVisualPostType(postType?: string): boolean {
  return !!postType && VISUAL_POST_TYPES.has(postType);
}

function isApiImagePath(path: string): boolean {
  return (
    path.includes("feed-images") ||
    path.includes("nfts/images") ||
    path.startsWith("nfts/")
  );
}

export function resolveReplyPostTitle(post?: UserReplyPost | null): string | undefined {
  if (!post) return undefined;
  const title = cleanText(post.title || post.name);
  if (title && title.toLowerCase() !== UNTITLED) return title;
  const description = cleanText(post.description);
  if (description) {
    return description.length > 120 ? `${description.slice(0, 120)}…` : description;
  }
  return undefined;
}

/** Mirrors QuotedPostEmbed / FeedCard URL rules per post type. */
export function resolveReplyPostThumbnail(
  post: UserReplyPost | null | undefined,
  tokenId: number,
): string | undefined {
  if (!post) return undefined;
  const postType = post.postType ?? "feed-simple";

  if (postType === "feed-images" || postType === "image") {
    const urls = Array.isArray(post.imageUrls) ? post.imageUrls : [];
    if (urls.length > 0) {
      const url = getImageUrlApiSimple(urls[0]);
      return url || undefined;
    }
    const fallback = post.imageUrl || post.thumbnailUrl || post.thumbnail_url;
    if (fallback) {
      if (fallback.startsWith("http://") || fallback.startsWith("https://")) return fallback;
      if (isApiImagePath(fallback)) return getImageUrlApiSimple(fallback) || undefined;
      return getImageUrl(fallback) || buildImageUrl(post.tokenId ?? tokenId, fallback) || undefined;
    }
    return undefined;
  }

  if (postType === "video" || postType === "short") {
    const raw =
      post.thumbnailUrl ||
      post.thumbnail_url ||
      post.imageUrl ||
      (post.videoUrl ? post.imageUrl : undefined);
    if (!raw) return undefined;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (isApiImagePath(raw)) return getImageUrlApiSimple(raw) || undefined;
    return getImageUrl(raw) || buildImageUrl(post.tokenId ?? tokenId, raw) || undefined;
  }

  const firstFeedImage = Array.isArray(post.imageUrls) ? post.imageUrls[0] : undefined;
  const rawThumb =
    post.thumbnailUrl ||
    post.thumbnail_url ||
    firstFeedImage ||
    post.imageUrl;
  if (!rawThumb) return undefined;
  if (rawThumb.startsWith("http://") || rawThumb.startsWith("https://")) return rawThumb;
  if (isApiImagePath(rawThumb)) return getImageUrlApiSimple(rawThumb) || undefined;
  return buildImageUrl(post.tokenId ?? tokenId, rawThumb) || getImageUrl(rawThumb) || undefined;
}

export function resolveReplyPostCreator(post?: UserReplyPost | null): string | undefined {
  if (!post) return undefined;
  return cleanText(post.minterUsername || post.minterDisplayName || post.minter) || undefined;
}

export function hasDisplayablePostContext(
  post?: UserReplyPost | null,
  tokenId?: number,
): boolean {
  if (!post && !tokenId) return false;
  const tid = post?.tokenId ?? tokenId ?? 0;
  return !!resolveReplyPostTitle(post) || !!resolveReplyPostThumbnail(post, tid);
}

/** Fetch full NFT when comments API only returns sparse post context. */
export function needsReplyPostEnrichment(
  post: UserReplyPost | undefined,
  tokenId: number,
): boolean {
  if (!tokenId) return false;
  if (!post) return true;
  if (resolveReplyPostThumbnail(post, tokenId)) return false;
  if (isVisualPostType(post.postType)) return true;
  return !hasDisplayablePostContext(post, tokenId);
}

export function nftToReplyPost(nft: Record<string, any>, tokenId: number): UserReplyPost {
  return {
    tokenId,
    name: nft.name,
    title: nft.title,
    description: nft.description,
    imageUrl: nft.imageUrl,
    imageUrls: nft.imageUrls,
    thumbnailUrl: nft.thumbnailUrl ?? nft.thumbnail_url,
    thumbnail_url: nft.thumbnail_url ?? nft.thumbnailUrl,
    videoUrl: nft.videoUrl,
    postType: nft.postType ?? nft.media_type,
    minter: nft.minter,
    minterUsername: nft.minterUsername ?? nft.minterUser?.username,
    minterDisplayName: nft.minterDisplayName ?? nft.minterUser?.displayName,
  };
}
