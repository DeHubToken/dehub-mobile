import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Locally cleared notifications.
 *
 * The API has no delete endpoint — `/notification` only supports PATCH (read)
 * and mark-all-read — so "clear" is a client-side dismissal, the same trade web
 * takes with its `notifications_cleared_at` stamp. A cleared row is marked read
 * server-side (so the badge is honest on every device) and its id is remembered
 * here, so a refetch cannot resurrect it on this device.
 *
 * Keyed by wallet address: two accounts on one phone must not inherit each
 * other's cleared rows.
 */

const PREFIX = 'notif-dismissed';

/**
 * Ids are only useful while the API can still hand the row back, i.e. while it
 * is inside a page the screen fetches. 500 covers far more than the ~130 rows a
 * session ever pages through, and bounds what one account can accumulate.
 */
export const MAX_DISMISSED = 500;

const storageKey = (address: string) => `${PREFIX}:${address.toLowerCase()}`;

/**
 * Newest first, deduped, capped. Pure so the cap and ordering are testable
 * without a storage double.
 */
export function mergeDismissed(
  existing: readonly string[],
  added: readonly string[],
  cap: number = MAX_DISMISSED,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...added, ...existing]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= cap) break;
  }
  return out;
}

/** Ids this address has cleared. Empty for a signed-out user or unreadable store. */
export async function getDismissedIds(address?: string | null): Promise<string[]> {
  if (!address) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Add ids to the cleared set. Returns the stored list, newest first. */
export async function addDismissedIds(
  address: string | null | undefined,
  ids: readonly string[],
): Promise<string[]> {
  if (!address || !ids.length) return [];
  const next = mergeDismissed(await getDismissedIds(address), ids);
  try {
    await AsyncStorage.setItem(storageKey(address), JSON.stringify(next));
  } catch {
    // Best effort: the row still disappears for this session.
  }
  return next;
}

/** Forget every cleared id for this address. */
export async function clearDismissedIds(address?: string | null): Promise<void> {
  if (!address) return;
  try {
    await AsyncStorage.removeItem(storageKey(address));
  } catch {}
}
