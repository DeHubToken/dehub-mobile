/**
 * Per-row visibility for a feed list, outside React state.
 *
 * The home list used to keep the set of on-screen row keys in `useState`, and
 * hand it to `renderItem` through `extraData`. Every viewability tick during a
 * fling (one per 150ms or so) therefore rebuilt `renderItem`, changed
 * `extraData`, and made VirtualizedList re-render EVERY mounted cell — each of
 * them a 1,700-line card — to tell two of them their visibility had moved.
 *
 * Here the list writes into a plain store and each row subscribes to its own
 * key with `useSyncExternalStore`, so a tick re-renders only the rows whose
 * answer actually changed. The list's `renderItem` no longer depends on
 * visibility at all.
 */
import { useSyncExternalStore } from "react";

export interface FeedVisibilityStore {
  /** Rows at or above the viewability threshold. */
  isVisible(key: string): boolean;
  /** The one row currently holding the autoplay slot. */
  isAutoplay(key: string): boolean;
  /** Apply a viewability tick. Notifies only the rows whose state changed. */
  update(visible: ReadonlySet<string>, autoplayKey: string | null): void;
  subscribe(key: string, fn: () => void): () => void;
}

export function createFeedVisibilityStore(): FeedVisibilityStore {
  let visible: ReadonlySet<string> = new Set();
  let autoplay: string | null = null;
  const listeners = new Map<string, Set<() => void>>();

  const notify = (key: string) => {
    const fns = listeners.get(key);
    if (!fns) return;
    fns.forEach((fn) => fn());
  };

  return {
    isVisible: (key) => visible.has(key),
    isAutoplay: (key) => autoplay === key,
    update(nextVisible, nextAutoplay) {
      const changed = new Set<string>();
      for (const key of visible) if (!nextVisible.has(key)) changed.add(key);
      for (const key of nextVisible) if (!visible.has(key)) changed.add(key);
      if (autoplay !== nextAutoplay) {
        if (autoplay) changed.add(autoplay);
        if (nextAutoplay) changed.add(nextAutoplay);
      }
      visible = nextVisible;
      autoplay = nextAutoplay;
      changed.forEach(notify);
    },
    subscribe(key, fn) {
      let fns = listeners.get(key);
      if (!fns) {
        fns = new Set();
        listeners.set(key, fns);
      }
      fns.add(fn);
      return () => {
        fns!.delete(fn);
        if (fns!.size === 0) listeners.delete(key);
      };
    },
  };
}

/** This row's visibility, re-rendering only when its own answer changes. */
export function useRowVisibility(
  store: FeedVisibilityStore,
  key: string,
): { isVisible: boolean; isAutoplay: boolean } {
  const subscribe = (fn: () => void) => store.subscribe(key, fn);
  const isVisible = useSyncExternalStore(subscribe, () => store.isVisible(key));
  const isAutoplay = useSyncExternalStore(subscribe, () => store.isAutoplay(key));
  return { isVisible, isAutoplay };
}
