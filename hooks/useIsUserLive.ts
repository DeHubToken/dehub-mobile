/**
 * useIsUserLive
 * =============
 * Whether someone is on air right now: a video stream that is running, or a
 * live audio Stage they are hosting. Drives the ripple around their avatar.
 *
 * Nothing here fetches. Streams come from the same `/live` cache entry the
 * feed and the Live tab already poll (see useLiveStreams), and Stage hosts are
 * handed over by StageProvider from its own single fetch. Avatars appear by
 * the dozen in a scrolling feed, so the work per avatar is one Set lookup:
 * the Set is built once per response, not once per row.
 *
 * Stage hosts go through a tiny store rather than the Stage context because
 * that context changes on every floating reaction and participant update,
 * and every avatar on screen would re-render with it.
 */

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { liveStreamRows, liveStreamsQuery } from "./useLiveStreams";
import { isStreamLive } from "../libs/live-status";

const EMPTY: ReadonlySet<string> = new Set();

// ── Video streams ───────────────────────────────────────────────────────────

const streamCache = new WeakMap<object, ReadonlySet<string>>();

/** Lowercased addresses and usernames of everyone whose stream is on air. */
function liveStreamers(data: unknown): ReadonlySet<string> {
  if (!data || typeof data !== "object") return EMPTY;
  const cached = streamCache.get(data);
  if (cached) return cached;
  const keys = new Set<string>();
  for (const row of liveStreamRows(data)) {
    if (!isStreamLive(row)) continue;
    const account = (row as any).account || (row as any).streamer;
    for (const key of [row.address, account?.address, account?.username]) {
      if (typeof key === "string" && key) keys.add(key.toLowerCase());
    }
  }
  streamCache.set(data, keys);
  return keys;
}

// ── Stage hosts ─────────────────────────────────────────────────────────────

let stageHosts: ReadonlySet<string> = EMPTY;
let stageHostsKey = "";
const listeners = new Set<() => void>();

/**
 * Called by StageProvider whenever its live list changes. Its list is a new
 * array on every poll, so listeners are only told when the hosts differ.
 */
export function setLiveStageHosts(hosts: { address?: string | null; username?: string | null }[]): void {
  const keys = new Set<string>();
  for (const host of hosts) {
    if (host.address) keys.add(host.address.toLowerCase());
    if (host.username) keys.add(host.username.toLowerCase());
  }
  const key = [...keys].sort().join(",");
  if (key === stageHostsKey) return;
  stageHostsKey = key;
  stageHosts = keys.size ? keys : EMPTY;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getStageHosts = () => stageHosts;

// ── Hook ────────────────────────────────────────────────────────────────────

export function useIsUserLive(address?: string | null, username?: string | null): boolean {
  const enabled = !!(address || username);
  const { data: streamers = EMPTY } = useQuery({ ...liveStreamsQuery, enabled, select: liveStreamers });
  const hosts = useSyncExternalStore(subscribe, getStageHosts, getStageHosts);
  if (!enabled) return false;
  const a = address?.toLowerCase();
  const u = username?.toLowerCase();
  return (
    (!!a && (streamers.has(a) || hosts.has(a))) ||
    (!!u && (streamers.has(u) || hosts.has(u)))
  );
}

export default useIsUserLive;
