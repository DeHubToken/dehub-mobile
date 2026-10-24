import { useSyncExternalStore } from 'react';

/**
 * HLS ladders that would not play this session.
 *
 * A post's ladder can be broken while its MP4 is fine: a rendition the
 * decoder rejects, a manifest the CDN has not caught up with. Once a player
 * gives up on one, getPlaybackUrl answers the MP4 for that post on every
 * surface, so the feed card, fullscreen and the shorts viewer still build the
 * same string and keep handing one native player between them.
 *
 * Session-scoped on purpose: a ladder that failed on a bad connection gets
 * another chance after a restart.
 */
const failed = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** expo-video picks HLS from the extension, so this is what decides it too. */
export function isHlsUrl(url: string | null | undefined): url is string {
  return !!url && /\.m3u8(?:[?#]|$)/i.test(url);
}

/** True when this call retired the source. Anything that is not HLS is never recorded. */
export function markHlsFailed(url: string | null | undefined): boolean {
  if (!isHlsUrl(url) || failed.has(url)) return false;
  failed.add(url);
  listeners.forEach((listener) => listener());
  return true;
}

export function hasHlsFailed(url: string | null | undefined): boolean {
  return !!url && failed.has(url);
}

/**
 * `read()` again whenever a ladder is retired. The component re-renders only
 * when its own answer changes, so a failure on one post does not re-render
 * every card in the feed. `read` must return a primitive (a URL string).
 */
export function useHlsFallback<T>(read: () => T): T {
  return useSyncExternalStore(subscribe, read, read);
}
