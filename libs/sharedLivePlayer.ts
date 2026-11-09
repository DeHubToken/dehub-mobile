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
import { Platform } from "react-native";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import {
  EVENT_LIVE_BUFFER_OPTIONS,
  EVENT_TARGET_OFFSET_FROM_LIVE_SEC,
  LIVE_BUFFER_OPTIONS,
} from "./videoBuffering";
import { releaseAfterPictureInPicture } from './pictureInPicture';
import { shareAudioWhenSilent } from "./videoAudioMixing";
import { perfMark } from "./perfTrace";

interface Entry {
  player: VideoPlayer;
  refs: number;
  timer?: ReturnType<typeof setTimeout>;
  /** Stops the stall watch (settleBehindLiveOnStall). */
  unwatch: () => void;
}

const RELEASE_GRACE_MS = 1500;
const entries = new Map<string, Entry>();

/**
 * Live URLs whose creator marked the broadcast a big event. Recorded by the
 * surfaces that know the stream (the feed card and the viewer) and read when
 * the player is built, so whichever of them creates the shared player gives it
 * the deep buffer — and a player that already exists is retuned in place.
 */
const bigEventUrls = new Set<string>();

function tuneForLatency(player: VideoPlayer, url: string) {
  const event = bigEventUrls.has(url);
  player.bufferOptions = event ? EVENT_LIVE_BUFFER_OPTIONS : LIVE_BUFFER_OPTIONS;
  if (event && Platform.OS === "ios") {
    try {
      player.targetOffsetFromLive = EVENT_TARGET_OFFSET_FROM_LIVE_SEC;
    } catch {
      /* Older native module without the property — the buffer still applies. */
    }
  }
}

/** Mark (or unmark) a live URL as a big event before or after its player exists. */
export function markBigEventLive(url: string | null | undefined, event: boolean): void {
  if (!url) return;
  if (event === bigEventUrls.has(url)) return;
  if (event) bigEventUrls.add(url);
  else bigEventUrls.delete(url);
  const entry = entries.get(url);
  if (entry) tuneForLatency(entry.player, url);
}

/**
 * Android: how far behind live a stream settles once it has stalled, in
 * seconds. With LIVE_BUFFER_OPTIONS' three seconds of forward buffer, the next
 * thing the player fetches from six seconds back is always a finished
 * two-second segment, never the newest 0.2s part.
 */
export const SETTLED_LIVE_OFFSET_SEC = 6;

/**
 * The start of a fresh muxer's playlist is seven placeholder segments
 * (EXT-X-GAP, 2.002s each) with no picture in them. A settling seek never
 * lands in the first this-many seconds of the window, so it always lands on
 * real picture, whether the muxer is new or has run for an hour. Once it has
 * run a while the window is 16 segments, about 32 seconds (`hlsSegmentCount`
 * in the backend's deploy/mediamtx/mediamtx.yml), so the settle point is well
 * clear of this.
 */
export const PLACEHOLDER_WINDOW_SEC = 14.2;

/**
 * Where a stalled live should be sent, or null to leave it alone.
 *
 * `position` and `windowDuration` are in the player's window (seconds from its
 * first segment). `windowDuration` is the window as the player last saw it
 * when ready, so it trails the real edge by up to a stall; that only ever
 * lands the seek a little further back than asked.
 */
export function settleTarget(position: number, windowDuration: number, want: number): number | null {
  if (!Number.isFinite(position) || !Number.isFinite(windowDuration) || windowDuration <= 0) return null;
  // Already far enough behind live: this stall is the network, not the edge.
  if (windowDuration - position >= want - 1) return null;
  const target = Math.max(PLACEHOLDER_WINDOW_SEC, windowDuration - want);
  // Not enough real picture behind live yet (a stream nobody was watching
  // starts with placeholders): wait for a later stall rather than settle twice.
  if (windowDuration - target < want - 1.5) return null;
  if (position - target < 1) return null;
  return target;
}

/**
 * Android only: once a live stalls, settle it a few seconds behind the edge.
 *
 * The self-hosted ingest serves low-latency HLS: two-second segments, each
 * also published as 0.2s parts, with a half-second hold-back. ExoPlayer takes
 * that hold-back as its target, plays from the newest parts and fetches them
 * one request at a time, a round trip each. From a phone 250ms from the
 * server (measured 2026-11-09, a home connection in France to the London
 * droplet), a 0.2s part costs about 0.4s to fetch: the player gets half a
 * second of picture per second and stops to buffer every second or two for as
 * long as the stream is open. That is what "lives are so slow" was.
 *
 * A seek sets ExoPlayer's target offset to wherever it lands (media3's
 * ExoPlayerImplInternal hands the seek position to
 * setTargetLiveOffsetOverrideUs), so one seek back moves the player onto whole
 * segments for good: one request per two seconds of picture instead of ten.
 * It costs a few seconds of replay, once. A phone near the server never
 * stalls, never gets here, and keeps the half-second latency.
 */
export function settleBehindLiveOnStall(player: VideoPlayer, url: string): () => void {
  if (Platform.OS !== "android") return () => undefined;
  let played = false;
  // Once per source: the buffering our own seek causes, and any stall after
  // it, is the network's and is left to the player.
  let settled = false;
  const subs = [
    player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying) played = true;
    }),
    player.addListener("statusChange", ({ status }) => {
      // Buffering before the first frame is the start, not a stall.
      if (status !== "loading" || !played || settled) return;
      try {
        const want = bigEventUrls.has(url) ? EVENT_TARGET_OFFSET_FROM_LIVE_SEC : SETTLED_LIVE_OFFSET_SEC;
        const target = settleTarget(player.currentTime, player.duration, want);
        if (target == null) return;
        settled = true;
        perfMark(`live settle ${(player.duration - target).toFixed(1)}s behind`);
        player.currentTime = target;
      } catch {
        /* A released player: nothing to settle. */
      }
    }),
    // A reloaded source starts at the live edge again.
    player.addListener("sourceChange", () => {
      played = false;
      settled = false;
    }),
  ];
  return () => subs.forEach((sub) => sub.remove());
}

function scheduleRelease(url: string, entry: Entry) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (entry.refs > 0 || entries.get(url) !== entry) return;
    releaseAfterPictureInPicture(entry.player, () => {
      if (entry.refs > 0 || entries.get(url) !== entry) return;
      entries.delete(url);
      entry.unwatch();
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
    shareAudioWhenSilent(player);
    tuneForLatency(player, url);
    entry = { player, refs: 0, unwatch: settleBehindLiveOnStall(player, url) };
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
