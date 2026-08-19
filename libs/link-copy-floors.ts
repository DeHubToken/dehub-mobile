/**
 * Optimistic floor for the link-copy share counter.
 * =================================================
 * Split out of libs/link-copy-count.ts so it imports nothing but React.
 * libs/auth.utils.ts has to clear this on sign-out, and link-copy-count.ts
 * reaches services/supabase, which reaches back into auth.utils for the token —
 * so keeping the store in there would close an import cycle.
 *
 * WHY A FLOOR AND NOT A DELTA
 * A delta gets added on top of the server total again the moment the count
 * query refetches and already includes the same copy, so the share counter
 * would read one too high until the component unmounted. A floor — the count
 * at copy time, plus one — is absorbed silently as soon as the server catches
 * up, because the display takes max(server, floor).
 *
 * The store is module-level so it survives a card being recycled out of the
 * list window, the same reason libs/engagementCache.ts is an overlay.
 */

import { useCallback, useSyncExternalStore } from "react";

const floors = new Map<string, number>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Lowest count this post may display, given a copy this session. 0 when none. */
export function getLinkCopyFloor(tokenId?: string | number | null): number {
  if (tokenId == null) return 0;
  return floors.get(String(tokenId)) ?? 0;
}

/**
 * Re-renders whenever any surface records a copy, so the shorts viewer and the
 * feed card behind it agree without either refetching.
 */
export function useLinkCopyFloor(tokenId?: string | number | null): number {
  const getSnapshot = useCallback(() => getLinkCopyFloor(tokenId), [tokenId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Record that this session copied `tokenId`, given the count it was showing. */
export function raiseLinkCopyFloor(tokenId: string, serverCount: number): void {
  const next = Math.max(floors.get(tokenId) ?? 0, serverCount + 1);
  floors.set(tokenId, next);
  emit();
}

/**
 * Call on sign-out. The next account has copied nothing, so its cards should
 * not open holding the previous one's optimistic bumps.
 */
export function clearLinkCopyFloors(): void {
  floors.clear();
  emit();
}
