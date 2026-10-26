/**
 * Phones: Home opens text, image and audio posts in place, under its own logo
 * bar and feed pill, the way phone web keeps the feed's chrome when a card is
 * opened. Home registers itself here while it is focused; a card asks it
 * first and only pushes the post page when nothing claims the post.
 */
type Host = (tokenId: string) => void;

let host: Host | null = null;

export function setFeedPostHost(next: Host | null): void {
  host = next;
}

/** True when Home took the post; the caller then skips its own navigation. */
export function openPostInFeedHost(tokenId: number | string): boolean {
  if (!host) return false;
  host(String(tokenId));
  return true;
}
