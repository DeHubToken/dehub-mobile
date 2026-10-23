/**
 * useIsUserLive
 * =============
 * Whether someone is on air right now: a video stream that is running, or a
 * live audio Stage they are hosting. Drives the ripple around their avatar,
 * and (useLiveTarget) where a tap on that avatar goes while they are live.
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

/** What a live person is on: the stream to open, or the Stage they host. */
export type LiveTarget =
  | { kind: "stream"; streamId: string; tokenId?: string | number }
  | { kind: "stage"; id: string };

type Targets = ReadonlyMap<string, LiveTarget>;
const EMPTY: Targets = new Map();

// ── Video streams ───────────────────────────────────────────────────────────

const streamCache = new WeakMap<object, Targets>();

/** Lowercased addresses and usernames of everyone whose stream is on air. */
function liveStreamers(data: unknown): Targets {
  if (!data || typeof data !== "object") return EMPTY;
  const cached = streamCache.get(data);
  if (cached) return cached;
  const keys = new Map<string, LiveTarget>();
  for (const row of liveStreamRows(data)) {
    if (!isStreamLive(row)) continue;
    const account = (row as any).account || (row as any).streamer;
    const streamId = String(row._id ?? (row as any).id ?? (row as any).streamId ?? "");
    const target: LiveTarget = {
      kind: "stream",
      streamId,
      ...((row as any).tokenId != null ? { tokenId: (row as any).tokenId } : {}),
    };
    for (const key of [row.address, account?.address, account?.username]) {
      if (typeof key === "string" && key && !keys.has(key.toLowerCase())) keys.set(key.toLowerCase(), target);
    }
  }
  streamCache.set(data, keys);
  return keys;
}

// ── Stage hosts ─────────────────────────────────────────────────────────────

let stageHosts: Targets = EMPTY;
let stageHostsKey = "";
const listeners = new Set<() => void>();

/**
 * Called by StageProvider whenever its live list changes. Its list is a new
 * array on every poll, so listeners are only told when the hosts differ.
 */
export function setLiveStageHosts(
  hosts: { address?: string | null; username?: string | null; id?: string | null }[],
): void {
  const keys = new Map<string, LiveTarget>();
  for (const host of hosts) {
    const target: LiveTarget = { kind: "stage", id: host.id ?? "" };
    if (host.address) keys.set(host.address.toLowerCase(), target);
    if (host.username) keys.set(host.username.toLowerCase(), target);
  }
  const key = [...keys].map(([k, t]) => `${k}:${(t as { id: string }).id}`).sort().join(",");
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

/** The stream or Stage this person is live on right now, or null. */
export function useLiveTarget(address?: string | null, username?: string | null): LiveTarget | null {
  const enabled = !!(address || username);
  const { data: streamers = EMPTY } = useQuery({ ...liveStreamsQuery, enabled, select: liveStreamers });
  const hosts = useSyncExternalStore(subscribe, getStageHosts, getStageHosts);
  if (!enabled) return null;
  for (const key of [address?.toLowerCase(), username?.toLowerCase()]) {
    if (!key) continue;
    const target = streamers.get(key) ?? hosts.get(key);
    if (target) return target;
  }
  return null;
}

export function useIsUserLive(address?: string | null, username?: string | null): boolean {
  return useLiveTarget(address, username) !== null;
}

export default useIsUserLive;
