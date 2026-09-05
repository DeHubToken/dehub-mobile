/**
 * Comment Draft Cache
 * ===================
 * One unsent comment per post, held in MMKV so nothing typed is ever lost:
 * closing the sheet, an accidental swipe-down, backing out of the screen, a
 * post the server refuses, or the app being killed all leave the text where
 * the composer finds it again on the next open.
 *
 * Mirrors web's `src/lib/comment-draft-cache.ts` — same store shape, same key,
 * same rules — so a fix to one reads as a fix to the other. It is deliberately
 * NOT the chat store in `libs/draft-cache.ts`: that one holds a bare string per
 * scope, and a comment draft has to carry the reply it was aimed at.
 *
 * MMKV and not AsyncStorage, for the same reason the chat store uses it: reads
 * must be synchronous, or the composer mounts empty and the draft pops in a
 * frame later.
 *
 * @module libs/comment-draft-cache
 */

import { storage } from "./storage";

const STORAGE_KEY = "dehub-comment-drafts-v2";
/** Forget a draft nobody came back to. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Ceiling on entries; the oldest go first. */
const MAX_DRAFTS = 100;
/** Per-draft ceiling, well above any composer's own limit. */
const MAX_CHARS = 20_000;

export interface CommentDraft {
  text: string;
  /** Comment being replied to, so the sheet reopens still pointed at it. */
  parentId?: number;
  parentUsername?: string;
  /** GIPHY URL — already hosted, so unlike a local file URI it survives. */
  gifUrl?: string;
  updatedAt: number;
}

type DraftStore = Record<string, CommentDraft>;

let mirror: DraftStore | null = null;

function load(): DraftStore {
  if (mirror) return mirror;
  const store: DraftStore = {};
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const cutoff = Date.now() - MAX_AGE_MS;
      for (const [key, value] of Object.entries(parsed ?? {})) {
        const entry = value as Partial<CommentDraft>;
        if (typeof entry?.text !== "string") continue;
        if ((entry.updatedAt ?? 0) < cutoff) continue;
        store[key] = entry as CommentDraft;
      }
    }
  } catch {
    // Corrupt or unreadable — an empty store is a valid answer.
  }
  mirror = store;
  return store;
}

function persist(store: DraftStore): void {
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_DRAFTS) {
      for (const key of keys
        .sort((a, b) => (store[a].updatedAt ?? 0) - (store[b].updatedAt ?? 0))
        .slice(0, keys.length - MAX_DRAFTS)) {
        delete store[key];
      }
    }
    if (Object.keys(store).length === 0) {
      storage.delete(STORAGE_KEY);
      return;
    }
    storage.set(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // MMKV is synchronous and local; a failure here is not worth breaking a
    // keystroke over, and the in-memory mirror still holds the draft.
  }
}

/** Is there anything in here worth keeping? */
export function draftHasContent(draft: Pick<CommentDraft, "text" | "gifUrl">): boolean {
  return Boolean(draft.text.trim() || draft.gifUrl);
}

/**
 * Write the composer's current contents. An empty composer clears the entry
 * rather than storing a blank, so a cleared box does not come back full.
 */
export function saveCommentDraft(
  tokenId: number | string,
  draft: Omit<CommentDraft, "updatedAt">,
): void {
  const key = String(tokenId ?? "");
  if (!key) return;
  const store = load();
  if (draftHasContent(draft)) {
    store[key] = { ...draft, text: draft.text.slice(0, MAX_CHARS), updatedAt: Date.now() };
  } else if (!store[key]) {
    return; // nothing stored, nothing to clear — skip the write entirely
  } else {
    delete store[key];
  }
  persist(store);
}

/** The unsent comment for this post, if there is one. */
export function loadCommentDraft(tokenId: number | string): CommentDraft | null {
  const key = String(tokenId ?? "");
  if (!key) return null;
  return load()[key] ?? null;
}

/** Drop the draft — the comment posted, so it is no longer unsent. */
export function clearCommentDraft(tokenId: number | string): void {
  const key = String(tokenId ?? "");
  if (!key) return;
  const store = load();
  if (!store[key]) return;
  delete store[key];
  persist(store);
}

/** Test seam — drops the in-memory mirror so the next read re-parses storage. */
export function __resetCommentDraftCacheForTests(): void {
  mirror = null;
}
