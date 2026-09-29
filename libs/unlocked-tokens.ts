/**
 * Tokens the viewer unlocked (paid the PPV) THIS app session.
 *
 * FeedCard used to keep the unlock in component state, so a card recycled out
 * of the FlatList window re-locked a post the viewer had just paid for until
 * the next refetch delivered the server's isUnlocked. In-memory only — the
 * mobile mirror of web's sessionStorage unlocked-tokens store: the server's
 * flag takes over on the next real fetch, and sign-out clears it so one
 * account's unlocks never paint for another.
 *
 * Cards read it through useTokenUnlocked, so this set is the only place an
 * unlock lives: a card handed another post reads that post's answer, and a
 * payment that completes late unlocks the post it was for, on every card
 * showing it.
 */
import { useCallback, useSyncExternalStore } from "react";

const unlocked = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeUnlocked(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function markTokenUnlocked(tokenId: string | number | null | undefined): void {
  if (tokenId == null) return;
  unlocked.add(String(tokenId));
  emit();
}

export function isTokenUnlocked(tokenId: string | number | null | undefined): boolean {
  return tokenId != null && unlocked.has(String(tokenId));
}

export function clearUnlockedTokens(): void {
  unlocked.clear();
  emit();
}

/** Whether this post is unlocked this session; re-renders when that changes. */
export function useTokenUnlocked(tokenId: string | number | null | undefined): boolean {
  const get = useCallback(() => isTokenUnlocked(tokenId), [tokenId]);
  return useSyncExternalStore(subscribeUnlocked, get, get);
}
