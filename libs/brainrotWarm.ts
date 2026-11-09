/**
 * Head start for the shorts feed a tapped video opens into.
 *
 * The viewer opens with only the tapped clip; everything after it comes from
 * the five ranked lists in libs/brainrotFeed plus the account's watch history.
 * Fetched only once the viewer had mounted, those six requests took a second
 * or more on a phone, and every swipe in that time bounced back onto the same
 * clip: "it takes a few swipes to move on".
 *
 * So the first page of each list (and the watched ids) is fetched as soon as
 * a video card is on screen, or at the latest on the tap, and the viewer
 * takes those answers instead of asking again. Kept for a couple of minutes:
 * the lists are global rankings that barely move in that time, and a newer
 * open after that always goes back to the network.
 */
import {
  BRAINROT_BUCKETS,
  BRAINROT_PAGE_SIZE,
  BRAINROT_QUERIES,
} from "./brainrotFeed";

export const BRAINROT_WARM_TTL_MS = 2 * 60_000;

type Entry<T> = { at: number; promise: Promise<T> };

const pages = new Map<string, Entry<unknown>>();
let watched: (Entry<ReadonlySet<string>> & { account: string }) | null = null;

function pageKey(account: string, params: object): string {
  return `${account}|${JSON.stringify(params)}`;
}

function fresh(entry: { at: number } | null | undefined, now = Date.now()): boolean {
  return !!entry && now - entry.at < BRAINROT_WARM_TTL_MS;
}

export interface BrainrotWarmOptions<P> {
  /** Who the lists are for: personal fields (likes, follows) differ per account. */
  account: string;
  fetchPage: (params: any) => Promise<P>;
  loadWatchedIds?: () => Promise<ReadonlySet<string>>;
}

/** The first-page query of every list, exactly as the source asks for it. */
export function brainrotFirstPages() {
  return BRAINROT_BUCKETS.map((bucket) => ({ ...BRAINROT_QUERIES[bucket], page: 1, limit: BRAINROT_PAGE_SIZE }));
}

/** Start the first page of every list (and the watched ids) unless already young. */
export function warmBrainrotFeed<P>({ account, fetchPage, loadWatchedIds }: BrainrotWarmOptions<P>): void {
  const now = Date.now();
  for (const params of brainrotFirstPages()) {
    const key = pageKey(account, params);
    if (fresh(pages.get(key), now)) continue;
    const promise = fetchPage(params);
    promise.catch(() => {});
    pages.set(key, { at: now, promise });
  }
  if (loadWatchedIds && !(watched && watched.account === account && fresh(watched, now))) {
    const promise = loadWatchedIds();
    promise.catch(() => {});
    watched = { at: now, account, promise };
  }
}

/**
 * `fetchPage` for the brainrot source: a warmed first page when there is a
 * young one for this account, otherwise the network. A warmed request that
 * failed is retried fresh, so the head start can never make things worse.
 */
export function warmedBrainrotPage<P>(account: string, fetchPage: (params: any) => Promise<P>) {
  return (params: any): Promise<P> => {
    const key = pageKey(account, params);
    const hit = pages.get(key);
    if (!fresh(hit)) {
      pages.delete(key);
      return fetchPage(params);
    }
    return (hit!.promise as Promise<P>).catch(() => {
      pages.delete(key);
      return fetchPage(params);
    });
  };
}

/** The watched ids, from the warm-up when it is young and for this account. */
export function warmedWatchedIds(account: string, load: () => Promise<ReadonlySet<string>>) {
  return (): Promise<ReadonlySet<string>> => {
    const hit = watched;
    if (!hit || hit.account !== account || !fresh(hit)) return load();
    return hit.promise.catch(() => load());
  };
}

/** Tests only. */
export function resetBrainrotWarm(): void {
  pages.clear();
  watched = null;
}
