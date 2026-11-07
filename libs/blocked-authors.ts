/**
 * Accounts the viewer has blocked, so what they wrote leaves the screen at once.
 *
 * A block used to change nothing on screen until the next fetch: the post,
 * short, comment or conversation stayed where it was, and the persisted feed
 * cache brought it back on the next launch. Every block and unblock goes
 * through services/block.service, which records it here; cards, comment rows
 * and conversation rows read it and draw nothing for a blocked author.
 *
 * In-memory, like libs/unlocked-tokens: seeded from the account's own block
 * list (AuthContext) and from Settings' list, and cleared on sign-out so one
 * account's blocks never hide anything for the next. A block also prunes the
 * author's rows from the react-query caches, so the persisted feed is written
 * without them.
 */
import { useCallback, useSyncExternalStore } from "react";
import { queryClient } from "../config/queryClient";

const blocked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (address?: string | null): string => (address || "").trim().toLowerCase();

function emit(): void {
  version += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeBlockedAuthors(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isAuthorBlocked(address?: string | null): boolean {
  const key = keyOf(address);
  return !!key && blocked.has(key);
}

export function setAuthorBlocked(address: string | null | undefined, isBlocked: boolean): void {
  const key = keyOf(address);
  if (!key || blocked.has(key) === isBlocked) return;
  if (isBlocked) blocked.add(key);
  else blocked.delete(key);
  emit();
  if (isBlocked) pruneAuthorFromQueryCache(key);
}

/** Adds the server's list; never removes, so a block made this session survives a stale copy. */
export function seedBlockedAuthors(addresses: Array<string | null | undefined> | null | undefined): void {
  let changed = false;
  for (const address of addresses ?? []) {
    const key = keyOf(address);
    if (key && !blocked.has(key)) {
      blocked.add(key);
      changed = true;
    }
  }
  if (changed) emit();
}

export function clearBlockedAuthors(): void {
  if (!blocked.size) return;
  blocked.clear();
  emit();
}

/** Whether this author is blocked; re-renders when that changes. */
export function useIsAuthorBlocked(address?: string | null): boolean {
  const get = useCallback(() => isAuthorBlocked(address), [address]);
  return useSyncExternalStore(subscribeBlockedAuthors, get, get);
}

const getVersion = () => version;

/** Changes on every block or unblock. A list filtering through isAuthorBlocked puts it in its deps. */
export function useBlockedAuthorsVersion(): number {
  return useSyncExternalStore(subscribeBlockedAuthors, getVersion, getVersion);
}

// ── Cache pruning ───────────────────────────────────────────────────────────

type Row = Record<string, any>;

/** The author of a post-shaped row, read the way FeedCard reads it. */
const authorOf = (row: unknown): string => {
  if (!row || typeof row !== "object") return "";
  const r = row as Row;
  return keyOf(r.minterUser?.address || r.minter || r.owner);
};

function pruneList(list: unknown[], key: string): unknown[] {
  const kept = list.filter((row) => authorOf(row) !== key);
  return kept.length === list.length ? list : kept;
}

function prunePage(page: unknown, key: string): unknown {
  if (Array.isArray(page)) return pruneList(page, key);
  if (page && typeof page === "object") {
    const p = page as Row;
    for (const field of ["result", "items"]) {
      if (!Array.isArray(p[field])) continue;
      const kept = pruneList(p[field], key);
      if (kept !== p[field]) return { ...p, [field]: kept };
    }
  }
  return page;
}

function pruneData(data: unknown, key: string): unknown {
  const pages = (data as Row | null)?.pages;
  if (!Array.isArray(pages)) return prunePage(data, key);
  let changed = false;
  const next = pages.map((page: unknown) => {
    const pruned = prunePage(page, key);
    if (pruned !== page) changed = true;
    return pruned;
  });
  return changed ? { ...(data as Row), pages: next } : data;
}

/**
 * Drop the author's posts from every cached list (feeds are `{ result }` pages,
 * other lists plain arrays). Only queries that actually change are written,
 * and each keeps its own updatedAt so nothing is marked fresh by this.
 */
function pruneAuthorFromQueryCache(key: string): void {
  try {
    for (const query of queryClient.getQueryCache().getAll()) {
      const data = query.state.data;
      if (data == null || typeof data !== "object") continue;
      const next = pruneData(data, key);
      if (next !== data) queryClient.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
    }
  } catch {
    // Pruning is a nicety: the cards hide themselves either way.
  }
}
