import { useSyncExternalStore } from 'react';

/**
 * Posts the viewer disliked this session. A dislike means "not for me": the
 * feed card folds away at once (DislikeVanish) and, once it has, the feed
 * lists drop the row (`isDislikeGoneSync`). The API leaves disliked posts out
 * of every later feed page on its own, so nothing here needs to persist.
 * Undoing the dislike — on the post page or the profile Dislikes tab — brings
 * the post back.
 */
const hidden = new Set<string>();
const gone = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;

export function hideDislikedPost(tokenId: string | number): void {
  const id = String(tokenId);
  if (hidden.has(id)) return;
  hidden.add(id);
  emit();
}

/** The card finished folding away; lists may now drop the row. */
export function markDislikeGone(tokenId: string | number): void {
  const id = String(tokenId);
  if (!hidden.has(id) || gone.has(id)) return;
  gone.add(id);
  emit();
}

export function restoreDislikedPost(tokenId: string | number): void {
  const id = String(tokenId);
  const changed = hidden.delete(id);
  gone.delete(id);
  if (changed) emit();
}

export function isDislikeHiddenSync(tokenId: string | number | null | undefined): boolean {
  return tokenId != null && hidden.has(String(tokenId));
}

export function isDislikeGoneSync(tokenId: string | number | null | undefined): boolean {
  return tokenId != null && gone.has(String(tokenId));
}

/** Bumps on every change, so a list can re-filter its rows. */
export function useDislikedPostsVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

export function useDislikeHidden(tokenId: string | number | null | undefined): boolean {
  useDislikedPostsVersion();
  return isDislikeHiddenSync(tokenId);
}

/** Stored in the public profile `customs` blob; absent means private. Same key as web. */
export const DISLIKES_VISIBILITY_KEY = 'dislikesVisibility';

export function dislikesArePublic(customs: Record<string, unknown> | null | undefined): boolean {
  return customs?.[DISLIKES_VISIBILITY_KEY] === 'public';
}
