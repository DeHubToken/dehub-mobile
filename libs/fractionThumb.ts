import { buildFeedImageUrls, buildImageUrl } from "./misc";

/**
 * The picture a fraction listing should carry for a post.
 *
 * `imageUrl` is the cover of a single-image or video post. Multi-image posts
 * ("feed-images") leave it empty and keep their pictures in `imageUrls`, which
 * is why their listings used to be saved with no thumbnail at all. Text and
 * audio posts have neither and get a text card instead.
 */
export function fractionImageFor(
  post: { tokenId?: number | string; imageUrl?: string | null; imageUrls?: string[] | null } | null | undefined,
  widthPt = 200,
): string {
  if (!post) return "";
  const cover = post.tokenId != null ? buildImageUrl(post.tokenId, post.imageUrl, widthPt) : "";
  if (cover) return cover;
  return buildFeedImageUrls(post.imageUrls?.filter(Boolean), widthPt)[0] || "";
}

/**
 * A multi-image post's first picture is stored as feed-images/{tokenId}-1.jpg.
 * Used when the post itself can no longer be read (deleted or hidden).
 */
export function firstFeedImage(tokenId: string, postType?: string | null, widthPt = 200): string | null {
  if (!/images/.test(postType || "")) return null;
  return buildFeedImageUrls([`feed-images/${tokenId}-1.jpg`], widthPt)[0] || null;
}
