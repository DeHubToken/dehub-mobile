/**
 * Shared live player
 * ==================
 * One native player per live stream URL, shared by the feed card and the live
 * viewer.
 *
 * Opening a live used to build a second ExoPlayer on the viewer screen while
 * the card's kept running underneath it: the picture went to a spinner, the
 * stream reconnected from scratch, and two players pulled the same ladder for
 * as long as the viewer stayed open. Both surfaces now take the same player,
 * and a VideoView that mounts simply moves its picture over — no reconnect,
 * no gap.
 *
 * Refcounted by the components holding it. A player nobody holds is released
 * after a short grace, which is what lets it survive the card and the viewer
 * trading places during a navigation.
 */

import { useEffect, useMemo } from "react";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import { LIVE_BUFFER_OPTIONS } from "./videoBuffering";
import { releaseAfterPictureInPicture } from './pictureInPicture';

interface Entry {
  player: VideoPlayer;
  refs: number;
  timer?: ReturnType<typeof setTimeout>;
}

const RELEASE_GRACE_MS = 1500;
const entries = new Map<string, Entry>();

function scheduleRelease(url: string, entry: Entry) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (entry.refs > 0 || entries.get(url) !== entry) return;
    releaseAfterPictureInPicture(entry.player, () => {
      if (entry.refs > 0 || entries.get(url) !== entry) return;
      entries.delete(url);
      try { entry.player.release(); } catch { /* Already released. */ }
    });
  }, RELEASE_GRACE_MS);
}

function entryFor(url: string): Entry {
  let entry = entries.get(url);
  if (!entry) {
    const player = createVideoPlayer(url);
    player.loop = false;
    player.muted = true;
    player.bufferOptions = LIVE_BUFFER_OPTIONS;
    entry = { player, refs: 0 };
    entries.set(url, entry);
    // Nobody may claim it (the render that asked was thrown away); the grace
    // cleans it up rather than leaking a native player.
    scheduleRelease(url, entry);
  }
  return entry;
}

/** True when the stream's player is already alive — something was showing it. */
export function hasSharedLivePlayer(url: string | null | undefined): boolean {
  return !!url && entries.has(url);
}

/** The shared player for a live URL, or null when there is no URL. */
export function useSharedLivePlayer(url: string | null | undefined): VideoPlayer | null {
  const player = useMemo(() => (url ? entryFor(url).player : null), [url]);

  useEffect(() => {
    if (!url) return;
    const entry = entryFor(url);
    entry.refs += 1;
    clearTimeout(entry.timer);
    return () => {
      entry.refs -= 1;
      if (entry.refs <= 0) scheduleRelease(url, entry);
    };
  }, [url]);

  return player;
}

/** How many surfaces currently hold this stream's player. */
export function sharedLivePlayerHolders(url: string | null | undefined): number {
  return url ? entries.get(url)?.refs ?? 0 : 0;
}
