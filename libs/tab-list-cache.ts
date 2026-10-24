/**
 * What a profile tab's list last showed, kept in memory for the session.
 *
 * The profile shows one tab at a time and unmounts the rest, so without this
 * every switch back to Images, Comments or Videos started empty, spun, and
 * fetched page one again. Now a tab comes back with what it had, and only
 * refreshes once that copy is older than FRESH_MS.
 */
const MAX_ENTRIES = 30;
export const TAB_LIST_FRESH_MS = 60_000;

export interface TabListEntry<T> {
  items: T[];
  page: number;
  end: boolean;
  savedAt: number;
}

const store = new Map<string, TabListEntry<unknown>>();

export function readTabList<T>(key: string): TabListEntry<T> | undefined {
  return store.get(key) as TabListEntry<T> | undefined;
}

export function writeTabList<T>(key: string, items: T[], page: number, end: boolean): void {
  store.delete(key);
  store.set(key, { items, page, end, savedAt: Date.now() });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

export function isTabListFresh(entry: TabListEntry<unknown> | undefined): boolean {
  return !!entry && Date.now() - entry.savedAt < TAB_LIST_FRESH_MS;
}
