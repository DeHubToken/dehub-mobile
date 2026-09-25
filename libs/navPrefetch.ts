/**
 * Head starts for the screens a tap is about to open.
 *
 * Two things, both in-memory and deliberately outside the React Query cache
 * (which is persisted to disk and has a five-minute staleTime — far too long
 * for a thread someone may have just commented in):
 *
 * - Post seeds: the feed item a card was showing, so the post detail screen
 *   paints the post on its first frame instead of a skeleton while it
 *   refetches data the feed already had.
 * - Warm requests: a fetch started on tap (or press-in), handed to the screen
 *   that mounts a moment later so it joins the in-flight request instead of
 *   starting its own after the push has rendered. Each is used at most once
 *   and only while young, so a later open always goes to the network.
 */

const SEED_LIMIT = 20;
const WARM_TTL_MS = 5_000;

const seeds = new Map<string, unknown>();

export function seedPostDetail(tokenId: number | string, item: unknown): void {
  const key = String(tokenId);
  // Re-insert so the newest tap is the last one evicted.
  seeds.delete(key);
  seeds.set(key, item);
  if (seeds.size > SEED_LIMIT) {
    const oldest = seeds.keys().next().value;
    if (oldest !== undefined) seeds.delete(oldest);
  }
}

export function peekPostDetailSeed<T>(tokenId: number | string | undefined): T | null {
  if (tokenId == null) return null;
  return (seeds.get(String(tokenId)) as T | undefined) ?? null;
}

const warm = new Map<string, { at: number; promise: Promise<unknown> }>();

/** Start `fetch` now unless a young request for the same key is already out. */
export function warmRequest<T>(key: string, fetch: () => Promise<T>): void {
  const hit = warm.get(key);
  if (hit && Date.now() - hit.at < WARM_TTL_MS) return;
  const promise = fetch();
  // Nobody may ever take it; a failure here must not surface as unhandled.
  promise.catch(() => {});
  warm.set(key, { at: Date.now(), promise });
}

/**
 * The warmed request for `key` if one is young enough, otherwise a fresh
 * `fetch()`. A warmed request that failed is retried once fresh, so a head
 * start can never make the screen worse off than having none.
 */
export function takeWarmRequest<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const hit = warm.get(key);
  warm.delete(key);
  if (!hit || Date.now() - hit.at >= WARM_TTL_MS) return fetch();
  return (hit.promise as Promise<T>).catch(() => fetch());
}
