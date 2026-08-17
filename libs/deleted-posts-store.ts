import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dehub-deleted-posts';
const MAX = 500;

// In-memory cache to avoid repeated AsyncStorage reads in the same session
let cache: Set<string> | null = null;

async function load(): Promise<Set<string>> {
  if (cache !== null) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    cache = new Set();
  }
  return cache;
}

async function persist(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

export async function markPostDeleted(tokenId: string | number): Promise<void> {
  const ids = await load();
  ids.add(String(tokenId));
  await persist(ids);
}

export async function isPostDeleted(tokenId: string | number): Promise<boolean> {
  const ids = await load();
  return ids.has(String(tokenId));
}

export function isPostDeletedSync(tokenId: string | number): boolean {
  return cache !== null && cache.has(String(tokenId));
}

/**
 * Warm the in-memory cache so isPostDeletedSync can answer. The feed lists
 * call this on mount — without it the sync check is always false until the
 * first markPostDeleted of the session.
 */
export async function warmDeletedPosts(): Promise<void> {
  await load();
}
