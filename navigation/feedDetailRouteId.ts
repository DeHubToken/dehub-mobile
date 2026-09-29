/**
 * The id that makes each post its own FeedDetail route.
 *
 * Without one, navigating to FeedDetail from a FeedDetail (a "More posts" card,
 * a post link in a caption) reused the open route and swapped its params: the
 * new post inherited the old one's scroll position, draft and reply target, and
 * Back skipped the post you came from. With an id, a different post pushes a
 * fresh screen and a post already in the stack is brought back to the top.
 *
 * Reads the params in the same order as FeedDetailScreen, as a string, so a
 * caller passing a number and one passing a string land on the same route.
 * No id keeps the old behaviour.
 */
export function feedDetailRouteId(params: unknown): string | undefined {
  const p = params as
    | {
        tokenId?: unknown;
        id?: unknown;
        postId?: unknown;
        videoId?: unknown;
        nft?: { tokenId?: unknown; id?: unknown };
      }
    | undefined;
  const id = p?.tokenId ?? p?.id ?? p?.postId ?? p?.videoId ?? p?.nft?.tokenId ?? p?.nft?.id;
  return id != null && id !== "" ? String(id) : undefined;
}
