import { useCallback, useEffect, useSyncExternalStore } from 'react';

type Tally = { count: number; pending: number };
const counts = new Map<string, Tally>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export function readCommentCount(tokenId: string, server = 0): number {
  return counts.get(String(tokenId))?.count ?? server;
}

export function updateCommentCount(tokenId: string, delta: number): void {
  const key = String(tokenId);
  const previous = counts.get(key) ?? { count: 0, pending: 0 };
  counts.set(key, {
    count: Math.max(0, previous.count + delta),
    pending: previous.pending + delta,
  });
  notify();
}

export function observeCommentCount(tokenId: string, server: number): void {
  const key = String(tokenId);
  const previous = counts.get(key);
  const count = !previous ? server : previous.pending < 0
    ? Math.min(previous.count, server) : Math.max(previous.count, server);
  const pending = count === server ? 0 : previous?.pending ?? 0;
  if (previous?.count === count && previous.pending === pending) return;
  counts.set(key, { count, pending });
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Shared across feed copies and remounts; a stale card cannot undo a reply. */
export function useCommentCount(tokenId: string | number | undefined, server = 0): number {
  const key = tokenId == null ? '' : String(tokenId);
  const snapshot = useCallback(() => readCommentCount(key, server), [key, server]);
  const count = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (key) observeCommentCount(key, server);
  }, [key, server]);
  return key ? count : server;
}
