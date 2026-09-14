/**
 * "Is a feed currently being flung?" — a single flag outside React, so a leaf
 * that mounts mid-scroll can render something cheap and fill itself in once
 * the list settles.
 *
 * Why: a feed card is ~100 native views, and half of them are its icons — each
 * lucide icon is an SVG tree of four to six views. Traced on a Galaxy S24+,
 * every 2s stretch of a fling that created 600–1100 views was the stretch
 * with the slow frames; a card's mount ran 12–19ms, two frames at 120Hz.
 * Icons carry no layout information (their box is fixed by `size`), so they
 * are the one part of the card that can be mounted late without anything
 * shifting.
 */
import { useEffect, useState } from "react";

// A drag with the finger held down can outlast any fling; nothing should stay
// deferred forever because a settle event was missed (a list unmounting
// mid-fling, for one). Longer than any real fling, shorter than a user notices.
const SAFETY_MS = 2500;

let scrolling = false;
let safety: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function isFeedScrolling(): boolean {
  return scrolling;
}

export function setFeedScrolling(next: boolean): void {
  if (safety) {
    clearTimeout(safety);
    safety = null;
  }
  if (next) {
    scrolling = true;
    safety = setTimeout(() => {
      safety = null;
      if (scrolling) {
        scrolling = false;
        notify();
      }
    }, SAFETY_MS);
    return;
  }
  if (!scrolling) return;
  scrolling = false;
  notify();
}

export function subscribeFeedSettled(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * True once this component may do its expensive render: immediately when it
 * mounts at rest, otherwise on the first settle after it mounted. Never goes
 * back to false — a mounted icon stays mounted.
 */
export function useReadyAfterScroll(): boolean {
  const [ready, setReady] = useState(() => !scrolling);
  useEffect(() => {
    if (ready) return;
    if (!scrolling) {
      setReady(true);
      return;
    }
    return subscribeFeedSettled(() => setReady(true));
  }, [ready]);
  return ready;
}

export function __resetScrollActivityForTests(): void {
  scrolling = false;
  if (safety) clearTimeout(safety);
  safety = null;
  listeners.clear();
}
