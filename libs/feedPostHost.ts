/**
 * Phones: Home opens text and audio posts in place, under its own logo bar and
 * feed pill, the way phone web keeps the feed's chrome when a card is opened.
 * A photo post opens as its card in the Images tab's scroll view, the same as
 * phone web's `/app?image=`. Home registers itself here while it is focused; a
 * card asks it first and only pushes the post page when nothing claims the post.
 */
import type { UnifiedFeedItem } from "../services/feed.unified.service";

type Host = {
  openPost: (tokenId: string) => void;
  openImagePost: (item: UnifiedFeedItem) => void;
};

let host: Host | null = null;

export function setFeedPostHost(next: Host | null): void {
  host = next;
}

/** True when Home took the post; the caller then skips its own navigation. */
export function openPostInFeedHost(tokenId: number | string): boolean {
  if (!host) return false;
  host.openPost(String(tokenId));
  return true;
}

/** True when Home opened the photo post in its Images scroll view. */
export function openImagePostInFeedHost(item: UnifiedFeedItem): boolean {
  if (!host) return false;
  host.openImagePost(item);
  return true;
}
