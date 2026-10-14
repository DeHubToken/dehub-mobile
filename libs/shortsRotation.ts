// One reel always follows the opening post; the regular schedule then runs
// from SHORTS_FIRST_POST every SHORTS_POST_INTERVAL posts.
export const SHORTS_LEAD_POST = 1;
export const SHORTS_FIRST_POST = 6;
export const SHORTS_POST_INTERVAL = 12;
export const SHORTS_BATCH_SIZE = 10;
export const SHORTS_HISTORY_LIMIT = 200;

export type ShortsCandidate = {
  tokenId?: string | number;
  id?: string | number;
  postType?: string;
  videoDuration?: number;
  minter?: string;
  creatorId?: string;
  minterUsername?: string;
};

export const shortsId = (item: ShortsCandidate): string => String(item.tokenId ?? item.id ?? '');

export function shortsCreatorKey(item: ShortsCandidate): string {
  const address = item.minter?.trim() || item.creatorId?.trim();
  if (address) return `creator:${address.toLowerCase()}`;
  const username = item.minterUsername?.trim();
  return username ? `username:${username.toLowerCase()}` : `post:${shortsId(item)}`;
}

export function uniqueShortsCreators<T extends ShortsCandidate>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = shortsCreatorKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function shortsBatchCount(posts: number): number {
  if (posts < SHORTS_LEAD_POST) return 0;
  return 1 + (posts < SHORTS_FIRST_POST ? 0 : 1 + Math.floor((posts - SHORTS_FIRST_POST) / SHORTS_POST_INTERVAL));
}

export function shortsBatchIndex(posts: number): number {
  if (posts === SHORTS_LEAD_POST) return 0;
  return posts >= SHORTS_FIRST_POST && (posts - SHORTS_FIRST_POST) % SHORTS_POST_INTERVAL === 0
    ? 1 + (posts - SHORTS_FIRST_POST) / SHORTS_POST_INTERVAL : -1;
}

export function readShortsHistory(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(-SHORTS_HISTORY_LIMIT) : [];
  } catch { return []; }
}

export function rememberShorts(previous: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [...new Set([...previous, ...rows.flat()])].slice(-SHORTS_HISTORY_LIMIT);
}

// A repeatable weighted draw: rank still favours popular posts, while each
// visit has its own seed. New pages cannot reorder rows already allocated.
function drawValue(seed: string, id: string): number {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return ((hash >>> 0) + 1) / 4294967297;
}

export function extendShortsDraw<T extends ShortsCandidate>(
  rows: readonly (readonly string[])[], candidates: readonly T[], count: number,
  seed: string, recent: readonly string[], allowPartial: boolean,
): string[][] {
  if (rows.length >= count) return rows as string[][];
  const used = new Set(rows.flat());
  const history = new Set(recent);
  const unique = new Map<string, T>();
  for (const item of candidates) {
    const id = shortsId(item);
    if (id && !used.has(id) && !unique.has(id)) unique.set(id, item);
  }
  const remaining = [...unique.values()];
  const weighted = (items: T[]) => items.map((item, rank) => ({ item,
    recent: history.has(shortsId(item)) ? 1 : 0,
    score: -Math.log(drawValue(seed, shortsId(item))) * Math.sqrt(rank + 1),
  })).sort((a, b) => a.recent - b.recent || a.score - b.score).map(({ item }) => item);
  const videos = remaining.filter(item => item.postType !== 'feed-images');
  const long = (item: T) => (item.videoDuration ?? 0) > 90;
  const rankedVideos = [...weighted(videos.filter(long)), ...weighted(videos.filter(item => !long(item)))];
  const photos = weighted(remaining.filter(item => item.postType === 'feed-images'));
  const ordered: string[] = [];
  for (let i = 0; i < Math.max(rankedVideos.length, photos.length); i++) {
    if (rankedVideos[i]) ordered.push(shortsId(rankedVideos[i]));
    if (photos[i]) ordered.push(shortsId(photos[i]));
  }
  const next = rows.map(row => [...row]);
  while (next.length < count) {
    if (!ordered.length) {
      if (!allowPartial || !unique.size && !rows.length || !candidates.length) break;
      // Reuse only after the available pool is exhausted; a thin catalogue
      // must not leave every later insertion empty.
      const recycled = extendShortsDraw([], candidates, 1, `${seed}:cycle:${next.length}`,
        [...recent, ...next.flat()], true)[0];
      if (!recycled?.length) break;
      next.push(recycled);
      continue;
    }
    const creators = new Set<string>();
    const row: string[] = [];
    for (const id of ordered) {
      const creator = shortsCreatorKey(unique.get(id)!);
      if (creators.has(creator)) continue;
      creators.add(creator);
      row.push(id);
      if (row.length === SHORTS_BATCH_SIZE) break;
    }
    if (row.length < SHORTS_BATCH_SIZE && !allowPartial) break;
    const selected = new Set(row);
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (selected.has(ordered[i])) ordered.splice(i, 1);
    }
    next.push(row);
  }
  return next;
}
