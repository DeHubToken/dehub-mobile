import { storage } from './storage';

/**
 * Feed defaults: the Home tab the app opens on, and the feed filter toggles a
 * viewer has set, kept as their defaults until they reset them.
 *
 * Shared with web (dehubweb src/lib/feed-defaults.ts) through the account's
 * `customs`:
 *  - `defaultFeedTab`: web's tab names (home, shorts, images, videos, music, live)
 *  - `feedToggles`: a JSON string, `{ feed: { key: value } }`, holding only the
 *    toggles that differ from a feed's default, in web's vocabulary. Web keeps a
 *    set per feed; the app has one filter set for every tab and reads and writes
 *    the `home` set, leaving web's other feeds as they are.
 *
 * MMKV holds a copy so the first frame already has the values, and it is all a
 * signed-out viewer has.
 */

export const DEFAULT_FEED_TAB_KEY = 'defaultFeedTab';
export const FEED_TOGGLES_KEY = 'feedToggles';

const TAB_STORAGE_KEY = 'dehub:defaultFeedTab';
const TOGGLES_STORAGE_KEY = 'dehub:feedToggles';
const MAX_CUSTOMS_VALUE = 500;

/** App pager keys (screens/HomeScreen.tsx ALL_TAB_ORDER). */
export type AppFeedTab = 'all' | 'short' | 'feed-images' | 'video' | 'feed-audio' | 'live';
export type WebFeedTab = 'home' | 'shorts' | 'images' | 'videos' | 'music' | 'live';

const WEB_TO_APP_TAB: Record<WebFeedTab, AppFeedTab> = {
  home: 'all',
  shorts: 'short',
  images: 'feed-images',
  videos: 'video',
  music: 'feed-audio',
  live: 'live',
};
const APP_TO_WEB_TAB = Object.fromEntries(
  Object.entries(WEB_TO_APP_TAB).map(([web, app]) => [app, web]),
) as Record<AppFeedTab, WebFeedTab>;

export const FEED_TAB_ORDER: AppFeedTab[] = ['all', 'short', 'feed-images', 'video', 'feed-audio', 'live'];

// Web's sort and date names against the app's API values.
const SORT_TO_WEB: Record<string, string> = {
  createdAt: 'latest',
  score: 'for-you',
  random: 'random',
  views: 'most-viewed',
  likes: 'most-liked',
  comments: 'most-comments',
  tips: 'most-tipped',
  following: 'following',
};
const SORT_FROM_WEB = Object.fromEntries(Object.entries(SORT_TO_WEB).map(([a, w]) => [w, a]));
const DATE_TO_WEB: Record<string, string> = { '': 'all', day: 'today', week: 'week', month: 'month', year: 'year' };
const DATE_FROM_WEB = Object.fromEntries(Object.entries(DATE_TO_WEB).map(([a, w]) => [w, a]));
const ACCESS_TO_WEB: Record<string, string> = { ppv: 'ppv', bounty: 'w2e', locked: 'locked' };
const ACCESS_FROM_WEB = Object.fromEntries(Object.entries(ACCESS_TO_WEB).map(([a, w]) => [w, a]));

export type FeedToggles = Record<string, Record<string, unknown>>;

/** The app's share of the toggles: what HomeScreen's filters hold. */
export interface AppFeedToggles {
  sortBy?: string;
  dateRange?: string;
  contentAccess?: string[];
  category?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Changes made on this device (to push) and account values adopted (to apply). */
export const feedDefaultsEvents = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  emit(): void {
    listeners.forEach((fn) => fn());
  },
};

export function parseDefaultFeedTab(raw: unknown): AppFeedTab {
  return WEB_TO_APP_TAB[raw as WebFeedTab] ?? 'all';
}

export function parseFeedToggles(raw: unknown): FeedToggles {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: FeedToggles = {};
    for (const [feed, keys] of Object.entries(parsed)) {
      if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[feed] = { ...(keys as Record<string, unknown>) };
    }
    return out;
  } catch {
    return {};
  }
}

/** Compact JSON that fits a customs value; long category lists go first. */
export function serializeFeedToggles(toggles: FeedToggles): string {
  const copy: FeedToggles = {};
  for (const [feed, keys] of Object.entries(toggles)) {
    if (keys && Object.keys(keys).length) copy[feed] = { ...keys };
  }
  let json = JSON.stringify(copy);
  if (json.length <= MAX_CUSTOMS_VALUE) return json;
  for (const keys of Object.values(copy)) delete keys.categories;
  json = JSON.stringify(copy);
  return json.length <= MAX_CUSTOMS_VALUE ? json : '{}';
}

function readString(key: string): string | undefined {
  try { return storage.getString(key); } catch { return undefined; }
}
function writeString(key: string, value: string | null) {
  try {
    if (value === null) storage.delete(key);
    else storage.set(key, value);
  } catch { /* storage unavailable */ }
}

export function getDefaultFeedTab(): AppFeedTab {
  return parseDefaultFeedTab(readString(TAB_STORAGE_KEY));
}

export function setDefaultFeedTab(tab: AppFeedTab) {
  writeString(TAB_STORAGE_KEY, APP_TO_WEB_TAB[tab] ?? 'home');
  feedDefaultsEvents.emit();
}

export function readFeedToggles(): FeedToggles {
  return parseFeedToggles(readString(TOGGLES_STORAGE_KEY));
}

/** Web's home set, in the app's values. Unknown names are dropped. */
export function getAppFeedToggles(): AppFeedToggles {
  const home = readFeedToggles().home ?? {};
  const out: AppFeedToggles = {};
  const sort = SORT_FROM_WEB[home.sort as string];
  if (sort) out.sortBy = sort;
  const date = DATE_FROM_WEB[home.date as string];
  if (date !== undefined) out.dateRange = date;
  if (Array.isArray(home.contentFilters)) {
    const access = home.contentFilters.map((v) => ACCESS_FROM_WEB[v as string]).filter(Boolean);
    if (access.length) out.contentAccess = access;
  }
  if (Array.isArray(home.categories) && typeof home.categories[0] === 'string' && home.categories[0]) {
    out.category = home.categories[0];
  }
  return out;
}

/**
 * Save the app's filters as the home set. Values on the default are left out,
 * so the account holds only what the viewer actually changed. Keys web keeps
 * that the app has no control for (post type, follow group) are kept.
 */
export function setAppFeedToggles(toggles: AppFeedToggles) {
  const all = readFeedToggles();
  const home = { ...(all.home ?? {}) };
  const sort = toggles.sortBy ? SORT_TO_WEB[toggles.sortBy] : undefined;
  if (sort && sort !== 'latest') home.sort = sort; else delete home.sort;
  const date = toggles.dateRange !== undefined ? DATE_TO_WEB[toggles.dateRange] : undefined;
  if (date && date !== 'all') home.date = date; else delete home.date;
  const access = (toggles.contentAccess ?? []).map((v) => ACCESS_TO_WEB[v]).filter(Boolean);
  if (access.length) home.contentFilters = access; else delete home.contentFilters;
  if (toggles.category) home.categories = [toggles.category]; else delete home.categories;
  if (Object.keys(home).length) all.home = home; else delete all.home;
  const next = serializeFeedToggles(all);
  if (next === serializeFeedToggles(readFeedToggles())) return;
  writeString(TOGGLES_STORAGE_KEY, next === '{}' ? null : next);
  feedDefaultsEvents.emit();
}

/** "Reset feed toggles": every feed back to its stock filters, on web too. */
export function resetFeedToggles() {
  writeString(TOGGLES_STORAGE_KEY, null);
  feedDefaultsEvents.emit();
}

export function hasFeedToggles(): boolean {
  return Object.keys(readFeedToggles()).length > 0;
}

/**
 * Account values in. Returns whether anything changed, and whether the account
 * had each key at all (when it does not, this device's values get sent up).
 */
export function adoptAccountFeedDefaults(customs: Record<string, unknown> | undefined) {
  const tabRaw = customs?.[DEFAULT_FEED_TAB_KEY];
  const togglesRaw = customs?.[FEED_TOGGLES_KEY];
  const hasTab = typeof tabRaw === 'string';
  const hasToggles = typeof togglesRaw === 'string';
  let changed = false;
  if (hasTab) {
    const tab = APP_TO_WEB_TAB[parseDefaultFeedTab(tabRaw)];
    if (tab !== (readString(TAB_STORAGE_KEY) ?? 'home')) {
      writeString(TAB_STORAGE_KEY, tab);
      changed = true;
    }
  }
  if (hasToggles) {
    const next = serializeFeedToggles(parseFeedToggles(togglesRaw));
    if (next !== serializeFeedToggles(readFeedToggles())) {
      writeString(TOGGLES_STORAGE_KEY, next === '{}' ? null : next);
      changed = true;
    }
  }
  return { hasTab, hasToggles, changed };
}

/** The pair as customs entries, for a profile save. */
export function feedDefaultsCustoms(): Record<string, string> {
  return {
    [DEFAULT_FEED_TAB_KEY]: readString(TAB_STORAGE_KEY) ?? 'home',
    [FEED_TOGGLES_KEY]: serializeFeedToggles(readFeedToggles()),
  };
}
