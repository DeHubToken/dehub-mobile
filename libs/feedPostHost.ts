/**
 * Phones: Home opens text, image and audio posts in place, under its own logo
 * bar and feed pill, the way phone web keeps the feed's chrome when a card is
 * opened. Home registers itself here while it is focused; a card asks it
 * first and only pushes the post page when nothing claims the post.
 */
type OpenOptions = { comments?: boolean };
/** Returns false to turn the post down (the caller then handles it itself). */
type Host = (tokenId: string, options?: OpenOptions) => boolean;

let host: Host | null = null;

export function setFeedPostHost(next: Host | null): void {
  host = next;
}

let pendingComments: string | null = null;

/**
 * True when Home took the post; the caller then skips its own navigation.
 * `comments` opens the post with its comments sheet already up, in the
 * bottom half of the screen (the feed card's comment button).
 */
export function openPostInFeedHost(tokenId: number | string, options?: OpenOptions): boolean {
  if (!host) return false;
  pendingComments = options?.comments ? String(tokenId) : null;
  if (host(String(tokenId), options)) return true;
  pendingComments = null;
  return false;
}

/** The post page asks once, on opening, whether to start with comments up. */
export function takePendingFeedComments(tokenId: number | string): boolean {
  if (pendingComments !== String(tokenId)) return false;
  pendingComments = null;
  return true;
}
