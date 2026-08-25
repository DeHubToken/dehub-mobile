/**
 * Draft Cache
 * ===========
 * One durable store for every half-typed message in the app — DMs, group
 * chats, live chat. Text survives backing out of the thread, the screen
 * unmounting under the navigator, and the app being killed.
 *
 * Mirrors web's `src/lib/draft-cache.ts`, including the store shape, so the two
 * behave identically and a fix to one is a readable fix to the other.
 *
 * Why keyed on the peer and not the conversation: a thread you have never sent
 * to has no conversation id at all until `createAndStart` answers, and it gets
 * one seconds later while the composer is open. Anything keyed on that id is
 * being written under one name and read under another.
 *
 * MMKV, not AsyncStorage: reads must be synchronous. Async hydration means the
 * composer mounts empty and the draft pops in a frame later, which is both
 * visible and racy against the first keystroke.
 *
 * @module libs/draft-cache
 */

import { storage } from "./storage";

const STORAGE_KEY = "dehub-drafts-v1";

/** Older than this and the draft is forgotten — a month-old half-sentence is noise. */
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
/** Newest-first cap, well above how many threads anyone touches in a month. */
const MAX_ENTRIES = 120;
/** Per-draft ceiling, above any composer's own limit so it never truncates real input. */
const MAX_CHARS = 20_000;

interface DraftEntry {
  /** The text itself. */
  t: string;
  /** Last-updated ms epoch — drives expiry and the newest-first trim. */
  u: number;
}

type DraftStore = Record<string, DraftEntry>;

let store: DraftStore | null = null;

/**
 * Monotonic stamp. Several drafts can be written inside one millisecond, and
 * with a plain Date.now() the trim would settle ties by insertion order — i.e.
 * keep the OLDEST and evict what was just typed.
 */
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* a bad subscriber must not break typing */ }
  }
}

/** Subscribe to draft changes — the conversation list uses this for its "Draft" line. */
export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function load(): DraftStore {
  if (store) return store;
  store = {};
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return store;
    const parsed = JSON.parse(raw) as { v?: number; d?: unknown };
    if (!parsed || parsed.v !== 1 || typeof parsed.d !== "object" || parsed.d === null) {
      return store;
    }
    const cutoff = Date.now() - MAX_AGE;
    for (const [key, value] of Object.entries(parsed.d as Record<string, unknown>)) {
      const entry = value as Partial<DraftEntry>;
      if (typeof entry?.t !== "string" || typeof entry?.u !== "number") continue;
      if (entry.u < cutoff) continue;
      store[key] = { t: entry.t, u: entry.u };
    }
  } catch {
    store = {};
  }
  return store;
}

function persist(): void {
  if (!store) return;
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const snapshot = store;
      const kept: DraftStore = {};
      for (const key of keys.sort((a, b) => snapshot[b].u - snapshot[a].u).slice(0, MAX_ENTRIES)) {
        kept[key] = snapshot[key];
      }
      store = kept;
    }
    if (Object.keys(store).length === 0) {
      storage.delete(STORAGE_KEY);
      return;
    }
    storage.set(STORAGE_KEY, JSON.stringify({ v: 1, w: Date.now(), d: store }));
  } catch {
    // MMKV is synchronous and local; a failure here is not worth breaking a
    // keystroke over. The in-memory mirror still holds the draft.
  }
}

/** Read the saved draft for a scope. Returns '' when there is none. */
export function readDraft(key: string): string {
  if (!key) return "";
  return load()[key]?.t ?? "";
}

/** True when a scope currently holds a draft. */
export function hasDraft(key: string): boolean {
  return !!key && !!load()[key];
}

/**
 * Save (or, for empty text, delete) the draft for a scope.
 * Whitespace-only counts as empty — a stray newline is not a draft worth keeping.
 */
export function writeDraft(key: string, text: string): void {
  if (!key) return;
  const current = load();
  if (!text.trim()) {
    if (!(key in current)) return;
    delete current[key];
  } else {
    if (current[key]?.t === text) return;
    current[key] = { t: text.slice(0, MAX_CHARS), u: stamp() };
  }
  emit();
  persist();
}

/** Drop a draft — call once the message has actually gone out. */
export function clearDraft(key: string): void {
  if (!key) return;
  const current = load();
  if (!(key in current)) return;
  delete current[key];
  emit();
  persist();
}

/** The scope a 1:1 or group thread's draft lives under. Stable for its whole life. */
export function dmDraftKey(peerAddress?: string | null, groupId?: string | null): string | null {
  if (groupId) return `group:${groupId}`;
  if (peerAddress) return `dm:${peerAddress.toLowerCase()}`;
  return null;
}

/** Test seam — drops the in-memory mirror so the next read re-parses storage. */
export function __resetDraftCacheForTests(): void {
  store = null;
  lastStamp = 0;
  listeners.clear();
}
