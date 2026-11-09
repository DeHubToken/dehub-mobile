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
 *
 * Whether the list is live at all — on the active pager page, on the focused
 * bottom tab — lives here too, for the same reason. It used to ride into
 * `renderItem` as a prop, so every tab switch in either direction rebuilt the
 * callback and re-rendered every mounted cell of every feed list to tell the
 * two or three on-screen rows to stop or start. Now a switch writes one flag
 * and only those rows hear about it.
 */
import { startTransition, useEffect, useState } from "react";

export interface FeedVisibilityStore {
  /** Rows at or above the viewability threshold, while the list is live. */
  isVisible(key: string): boolean;
  /** The one row currently holding the autoplay slot, while the list is live. */
  isAutoplay(key: string): boolean;
  /** Apply a viewability tick. Notifies only the rows whose state changed. */
  update(visible: ReadonlySet<string>, autoplayKey: string | null): void;
  /**
   * Whether the list is on screen at all. Off, every row answers "not visible"
   * and "not autoplay" whatever the last tick said, so a hidden list's players
   * stop and stay stopped; the tick's own bookkeeping is kept, so coming back
   * restores the same rows without waiting for a scroll. Flipping it notifies
   * only the rows whose answer moves — the ones on screen — not every mounted
   * cell.
   */
  setLive(live: boolean): void;
  subscribe(key: string, fn: () => void): () => void;
}

export function createFeedVisibilityStore(initialLive = true): FeedVisibilityStore {
  let visible: ReadonlySet<string> = new Set();
  let autoplay: string | null = null;
  let live = initialLive;
  const listeners = new Map<string, Set<() => void>>();

  const notify = (key: string) => {
    const fns = listeners.get(key);
    if (!fns) return;
    fns.forEach((fn) => fn());
  };

  return {
    isVisible: (key) => live && visible.has(key),
    isAutoplay: (key) => live && autoplay === key,
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
      // Nobody's answer moves while the list is dark; they all read false
      // before and after. The rows learn where they stand when it comes back.
      if (live) changed.forEach(notify);
    },
    setLive(next) {
      if (next === live) return;
      live = next;
      const affected = new Set(visible);
      if (autoplay) affected.add(autoplay);
      affected.forEach(notify);
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

interface RowAnswer {
  store: FeedVisibilityStore;
  key: string;
  isVisible: boolean;
  isAutoplay: boolean;
}

const readRow = (store: FeedVisibilityStore, key: string): RowAnswer => ({
  store,
  key,
  isVisible: store.isVisible(key),
  isAutoplay: store.isAutoplay(key),
});

const sameAnswer = (a: RowAnswer, b: RowAnswer) =>
  a.store === b.store && a.key === b.key && a.isVisible === b.isVisible && a.isAutoplay === b.isAutoplay;

/**
 * This row's visibility, re-rendering only when its own answer changes.
 *
 * A change arrives as a transition. Each flip re-renders a whole feed card
 * (15-20ms on a Galaxy S24+), and leaving or coming back to a feed flips every
 * card on screen at once: read with useSyncExternalStore, those ~140ms ran
 * inside the tab switch's own render, before the new tab could paint. Now the
 * switch paints first and the cards pause or resume right after it.
 *
 * A recycled row reads its new key's answer during render, so a card never
 * starts with the visibility of the post that held the row before it.
 */
export function useRowVisibility(
  store: FeedVisibilityStore,
  key: string,
): { isVisible: boolean; isAutoplay: boolean } {
  const [answer, setAnswer] = useState(() => readRow(store, key));
  const current = answer.store === store && answer.key === key ? answer : readRow(store, key);
  useEffect(() => {
    const sync = () => {
      const next = readRow(store, key);
      startTransition(() => setAnswer((prev) => (sameAnswer(prev, next) ? prev : next)));
    };
    // Anything that moved between this render and the subscription.
    if (!sameAnswer(current, readRow(store, key))) sync();
    return store.subscribe(key, sync);
    // `current` is only the answer this render showed; re-running for it
    // would resubscribe on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);
  return { isVisible: current.isVisible, isAutoplay: current.isAutoplay };
}
