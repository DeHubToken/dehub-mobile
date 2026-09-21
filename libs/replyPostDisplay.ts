import { buildImageUrl, getImageUrl, getImageUrlApiSimple } from "./misc";
import { getNFT } from "../services/nft.service";
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

/**
 * The post author's handle for display. Never the wallet address: the
 * comments endpoint only carries the minter as an address, and until the full
 * post is fetched there is simply no handle to show.
 */
export function resolveReplyPostCreator(post?: UserReplyPost | null): string | undefined {
  if (!post) return undefined;
  return (
    cleanText(
      post.minterUser?.username ||
        post.minterUsername ||
        post.minterUser?.displayName ||
        post.minterDisplayName,
    ) || undefined
  );
}

/**
 * Title and body the way the feed card splits them: the API often copies the
 * first line of the body into `name`, so a name is a title only when it says
 * something the body does not.
 */
export function resolveReplyPostBody(post?: UserReplyPost | null): { title?: string; body?: string } {
  if (!post) return {};
  const name = cleanText(post.title || post.name);
  const description = (post.description || "").trim();
  const hasTitle =
    name.length > 0 &&
    name.toLowerCase() !== UNTITLED &&
    name !== description.replace(/\s+/g, " ").trim() &&
    !description.replace(/\s+/g, " ").trim().startsWith(name);
  const body = description || (hasTitle ? "" : name);
  return { title: hasTitle ? name : undefined, body: body || undefined };
}

/** The comments endpoint never names the post's author; the full post does. */
export function needsReplyPostAuthor(post?: UserReplyPost | null): boolean {
  return !post || (!post.minterUser && !post.minterUsername && !post.minterDisplayName);
}

const replyPostRequests = new Map<number, Promise<UserReplyPost | null>>();

/**
 * Fetch the full post behind a reply once per tokenId — every reply on the
 * same post shares the request. Resolves null when the post cannot be read
 * (deleted, hidden, network), and forgets the failure so a remount can retry.
 */
export function loadReplyPost(tokenId: number): Promise<UserReplyPost | null> {
  let pending = replyPostRequests.get(tokenId);
  if (!pending) {
    pending = getNFT(tokenId)
      .then((res) => {
        const nft = res?.result;
        if (!nft) throw new Error("no post");
        return nftToReplyPost(nft as Record<string, any>, tokenId);
      })
      .catch(() => {
        replyPostRequests.delete(tokenId);
        return null;
      });
    replyPostRequests.set(tokenId, pending);
  }
  return pending;
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
    articleBody: nft.articleBody,
    imageUrl: nft.imageUrl,
    imageUrls: nft.imageUrls,
    thumbnailUrl: nft.thumbnailUrl ?? nft.thumbnail_url,
    thumbnail_url: nft.thumbnail_url ?? nft.thumbnailUrl,
    videoUrl: nft.videoUrl,
    postType: nft.postType ?? nft.media_type,
    createdAt: nft.createdAt,
    minter: nft.minter,
    minterUsername: nft.minterUsername ?? nft.minterUser?.username ?? nft.mintername,
    minterDisplayName: nft.minterDisplayName ?? nft.minterUser?.displayName,
    minterAvatarUrl: nft.minterAvatarUrl ?? nft.minterUser?.avatarImageUrl,
    minterUser: nft.minterUser ?? undefined,
  };
}
