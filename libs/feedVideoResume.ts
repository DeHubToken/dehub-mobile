/**
 * Where a feed video was when its player was let go.
 *
 * A feed card holds a player only while it is the one playing. Opening a
 * profile over the feed, or scrolling a little past the card, releases that
 * player, and coming straight back used to start the video from the top. The
 * place is kept for a short while so the return picks up where it stopped.
 */
const KEEP_MS = 60_000;
const MIN_SECONDS = 1;
const MAX_ENTRIES = 12;

const places = new Map<string, { at: number; saved: number }>();

export function rememberFeedVideoPlace(url: string | null | undefined, seconds: number, now = Date.now()): void {
  // A player that never got going says nothing about where the video was: a
  // card can mount and unmount one in passing before the real one starts, and
  // that must not wipe the place the real one is about to pick up.
  if (!url || !(seconds >= MIN_SECONDS)) return;
  places.delete(url);
  places.set(url, { at: seconds, saved: now });
  while (places.size > MAX_ENTRIES) {
    const oldest = places.keys().next().value;
    if (oldest === undefined) break;
    places.delete(oldest);
  }
}

/** The saved place in seconds, or 0. It stays until a player has used it. */
export function peekFeedVideoPlace(url: string | null | undefined, now = Date.now()): number {
  if (!url) return 0;
  const place = places.get(url);
  if (!place) return 0;
  if (now - place.saved > KEEP_MS) {
    places.delete(url);
    return 0;
  }
  return place.at;
}

/** A player has moved to the saved place: it is used up. */
export function usedFeedVideoPlace(url: string | null | undefined): void {
  if (url) places.delete(url);
}

export function clearFeedVideoPlaces(): void {
  places.clear();
}
