import { storage } from './storage';

/**
 * Feed filter presets: a named set of Home feed filters, picked again with one
 * tap from the filter panel. Shared with web (dehubweb src/lib/feed-presets.ts)
 * through `customs.feedPresets`, in web's vocabulary:
 *   [{ n: name, s?: sort, d?: date, p?: post type, c?: categories, a?: access }]
 * A customs value is at most 500 characters, so the oldest presets drop first
 * when the list would not fit.
 */

export const FEED_PRESETS_KEY = 'feedPresets';
const STORAGE_KEY = 'dehub:feedPresets';
const MAX_CUSTOMS_VALUE = 500;
export const MAX_FEED_PRESETS = 6;
export const MAX_PRESET_NAME = 24;

/** A preset in the app's own filter values. */
export interface AppFeedPreset {
  name: string;
  sortBy?: string;
  dateRange?: string;
  postType?: string;
  category?: string;
  contentAccess?: string[];
}

const SORT_TO_WEB: Record<string, string> = {
  createdAt: 'latest', score: 'for-you', random: 'random', views: 'most-viewed',
  likes: 'most-liked', comments: 'most-comments', tips: 'most-tipped', following: 'following',
};
const SORT_FROM_WEB = Object.fromEntries(Object.entries(SORT_TO_WEB).map(([a, w]) => [w, a]));
const DATE_TO_WEB: Record<string, string> = { day: 'today', week: 'week', month: 'month', year: 'year' };
const DATE_FROM_WEB = Object.fromEntries(Object.entries(DATE_TO_WEB).map(([a, w]) => [w, a]));
const ACCESS_TO_WEB: Record<string, string> = { ppv: 'ppv', bounty: 'w2e', locked: 'locked' };
const ACCESS_FROM_WEB = Object.fromEntries(Object.entries(ACCESS_TO_WEB).map(([a, w]) => [w, a]));
/** Post types the app filters Home by (the rest are pager pages). */
const POST_TYPES = ['article', 'feed-simple'];

type Listener = () => void;
const listeners = new Set<Listener>();
export const feedPresetsEvents = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  emit(): void {
    listeners.forEach((fn) => fn());
  },
};

const str = (v: unknown, max = 40): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

type Raw = Record<string, unknown>;

function parseRaw(raw: unknown): Raw[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p === 'object' && str(p.n, MAX_PRESET_NAME)).slice(0, MAX_FEED_PRESETS);
  } catch {
    return [];
  }
}

function serializeRaw(list: Raw[]): string {
  let out = list.slice(0, MAX_FEED_PRESETS);
  let json = JSON.stringify(out);
  while (json.length > MAX_CUSTOMS_VALUE && out.length > 0) {
    out = out.slice(0, -1);
    json = JSON.stringify(out);
  }
  return json;
}

function toApp(p: Raw): AppFeedPreset {
  const out: AppFeedPreset = { name: str(p.n, MAX_PRESET_NAME)! };
  const sort = SORT_FROM_WEB[p.s as string];
  if (sort && sort !== 'createdAt') out.sortBy = sort;
  const date = DATE_FROM_WEB[p.d as string];
  if (date) out.dateRange = date;
  if (POST_TYPES.includes(p.p as string)) out.postType = p.p as string;
  if (Array.isArray(p.c) && typeof p.c[0] === 'string' && p.c[0]) out.category = p.c[0];
  if (Array.isArray(p.a)) {
    const access = p.a.map((a) => ACCESS_FROM_WEB[a as string]).filter(Boolean);
    if (access.length) out.contentAccess = access;
  }
  return out;
}

function toRaw(p: AppFeedPreset): Raw {
  const o: Raw = { n: p.name };
  const sort = p.sortBy ? SORT_TO_WEB[p.sortBy] : undefined;
  if (sort && sort !== 'latest') o.s = sort;
  const date = p.dateRange ? DATE_TO_WEB[p.dateRange] : undefined;
  if (date) o.d = date;
  if (p.postType && POST_TYPES.includes(p.postType)) o.p = p.postType;
  if (p.category) o.c = [p.category];
  const access = (p.contentAccess ?? []).map((a) => ACCESS_TO_WEB[a]).filter(Boolean);
  if (access.length) o.a = access;
  return o;
}

function readRaw(): Raw[] {
  try { return parseRaw(storage.getString(STORAGE_KEY)); } catch { return []; }
}
function writeRaw(list: Raw[]) {
  try {
    const json = serializeRaw(list);
    if (json === '[]') storage.delete(STORAGE_KEY); else storage.set(STORAGE_KEY, json);
  } catch { /* storage unavailable */ }
}

export function readFeedPresets(): AppFeedPreset[] {
  return readRaw().map(toApp);
}

/** Newest first; a preset with the same name is replaced. Web-only keys it held are kept. */
export function saveFeedPreset(preset: AppFeedPreset) {
  const name = preset.name.trim().slice(0, MAX_PRESET_NAME);
  if (!name) return;
  const rest = readRaw().filter((p) => String(p.n).toLowerCase() !== name.toLowerCase());
  writeRaw([toRaw({ ...preset, name }), ...rest]);
  feedPresetsEvents.emit();
}

export function deleteFeedPreset(name: string) {
  writeRaw(readRaw().filter((p) => p.n !== name));
  feedPresetsEvents.emit();
}

export function presetMatches(a: AppFeedPreset, b: Omit<AppFeedPreset, 'name'>): boolean {
  const access = (x?: string[]) => [...(x ?? [])].sort().join('|');
  return (a.sortBy ?? '') === (b.sortBy ?? '')
    && (a.dateRange ?? '') === (b.dateRange ?? '')
    && (a.postType ?? '') === (b.postType ?? '')
    && (a.category ?? '') === (b.category ?? '')
    && access(a.contentAccess) === access(b.contentAccess);
}

/** Account value in. */
export function adoptAccountFeedPresets(customs: Record<string, unknown> | undefined): { has: boolean; changed: boolean } {
  const raw = customs?.[FEED_PRESETS_KEY];
  if (typeof raw !== 'string') return { has: false, changed: false };
  const next = serializeRaw(parseRaw(raw));
  const changed = next !== serializeRaw(readRaw());
  if (changed) {
    writeRaw(parseRaw(next));
    feedPresetsEvents.emit();
  }
  return { has: true, changed };
}

export function feedPresetsCustoms(): Record<string, string> {
  return { [FEED_PRESETS_KEY]: serializeRaw(readRaw()) };
}
