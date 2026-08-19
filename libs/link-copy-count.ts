/**
 * Post link-copy tracking
 * =======================
 * A "copy link" is a share, and counts alongside reposts in the number beside
 * the share button — the same contract the web app uses, against the same
 * `post_link_copies` Supabase table and the same two security-definer RPCs.
 *
 * Mobile had none of this before: handleCopyLink copied to the clipboard and
 * stopped, so the share button showed the repost count alone and a copy could
 * never move it.
 *
 * ONE COPY PER ACTOR PER POST
 * The dedupe key is `actor_id`: the lowercased wallet address when signed in,
 * otherwise this install's device id (SecureStore, via libs/device). So the
 * counter behaves like a repost — copying the same post ten times still reads
 * as one share.
 *
 * READS ARE BATCHED
 * A feed mounts one card per post, so a per-card query would be one request
 * per card. Ids asked for within a tick are collected into a single
 * `get_post_link_copy_counts` call, which already takes an array.
 *
 * OPTIMISTIC WITHOUT DOUBLE-COUNTING
 * Recording a copy stores a *floor* (count at copy time, plus one) rather than
 * a delta, and the display takes max(server, floor). A delta would be added on
 * top of the server total again as soon as the query refetched and included
 * the same copy; a floor is absorbed the moment the server catches up. The
 * store itself lives in libs/link-copy-floors.ts — a leaf module, because
 * auth.utils clears it on sign-out and importing this one there would close a
 * cycle back through services/supabase.
 *
 * Everything degrades to 0 / no-op if the migration has not been applied
 * (PGRST202), so the counter simply falls back to reposts alone.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { getDeviceId } from "./device";
import { raiseLinkCopyFloor } from "./link-copy-floors";

// Re-exported so a component needs one import for "the share count and my own
// pending copies", rather than knowing the store was split out for cycle reasons.
export { useLinkCopyFloor, getLinkCopyFloor } from "./link-copy-floors";

/* ------------------------------------------------------------------ *
 * Actor identity
 * ------------------------------------------------------------------ */

let cachedDeviceActor: string | null = null;

async function deviceActorId(): Promise<string> {
  if (cachedDeviceActor) return cachedDeviceActor;
  try {
    cachedDeviceActor = "device:" + (await getDeviceId());
  } catch {
    // SecureStore unavailable: a per-process id still dedupes repeat copies
    // within the session, which is the case that inflates counts.
    cachedDeviceActor =
      "device:" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  return cachedDeviceActor;
}

async function actorIdFor(walletAddress?: string | null): Promise<string> {
  const wallet = walletAddress?.trim().toLowerCase();
  return wallet || deviceActorId();
}

/* ------------------------------------------------------------------ *
 * Batched reads
 * ------------------------------------------------------------------ */

type Resolver = (count: number) => void;

let pendingIds = new Map<number, Resolver[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushPending(): Promise<void> {
  flushTimer = null;
  const batch = pendingIds;
  pendingIds = new Map();
  const ids = Array.from(batch.keys());

  let rows: Array<{ token_id: number | string; copies: number | string }> = [];
  try {
    const { data, error } = await (supabase.rpc as any)("get_post_link_copy_counts", {
      p_token_ids: ids,
    });
    if (!error && Array.isArray(data)) rows = data;
  } catch {
    // Leave rows empty — every waiter resolves to 0 below.
  }

  const byId = new Map<number, number>(
    rows.map((r) => [Number(r.token_id), Number(r.copies ?? 0)]),
  );
  batch.forEach((resolvers, id) => {
    const count = byId.get(id) ?? 0;
    resolvers.forEach((resolve) => resolve(count));
  });
}

function loadLinkCopyCount(id: number): Promise<number> {
  return new Promise<number>((resolve) => {
    const waiting = pendingIds.get(id);
    if (waiting) waiting.push(resolve);
    else pendingIds.set(id, [resolve]);
    if (!flushTimer) flushTimer = setTimeout(flushPending, 40);
  });
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

function numericId(tokenId?: string | number | null): number {
  if (tokenId == null) return NaN;
  return typeof tokenId === "number" ? tokenId : parseInt(tokenId, 10);
}

/** Aggregate link-copy count for one post. Returns 0 until data exists. */
export function usePostLinkCopyCount(tokenId?: string | number | null) {
  const id = numericId(tokenId);
  return useQuery({
    queryKey: ["post-link-copies", String(tokenId ?? "")],
    queryFn: () => loadLinkCopyCount(id),
    enabled: !Number.isNaN(id),
    staleTime: 30_000,
    // The counter is a public total, so it should track other people's copies.
    // There is no realtime feed for it: the table's RLS has no policies (reads
    // are aggregate-only through the RPC) and Postgres changefeeds honour RLS,
    // so a subscription would deliver nothing without opening row reads and
    // exposing every copier's wallet. Refetching on mount is the closest thing
    // that does not widen access — config/queryClient.ts turns it off globally.
    refetchOnMount: true,
  });
}

/**
 * Record that the current user copied this post's link, and raise the local
 * floor so the number moves on the same tap.
 *
 * `currentCount` is the server count the caller is displaying right now — the
 * floor is built from it, so pass what the user can see.
 */
export async function trackPostLinkCopy(
  tokenId: string | number | null | undefined,
  walletAddress?: string | null,
  currentCount = 0,
): Promise<void> {
  const id = numericId(tokenId);
  if (Number.isNaN(id)) return;

  raiseLinkCopyFloor(String(tokenId), currentCount);

  try {
    await (supabase.rpc as any)("track_post_link_copy", {
      p_token_id: id,
      p_actor: await actorIdFor(walletAddress),
      p_wallet: walletAddress?.toLowerCase() ?? null,
    });
  } catch {
    // Fire and forget: the floor already moved the number, and a lost row only
    // means the count reverts to the server total on the next refetch.
  }
}

/**
 * Copy-link handler helper: records the copy, then refreshes the count once the
 * write has landed so the displayed total becomes server-backed rather than
 * resting on the floor.
 */
export function useTrackPostLinkCopy() {
  const queryClient = useQueryClient();
  return useCallback(
    (
      tokenId: string | number | null | undefined,
      walletAddress?: string | null,
      currentCount = 0,
    ) => {
      void trackPostLinkCopy(tokenId, walletAddress, currentCount).then(() => {
        if (tokenId != null) {
          queryClient.invalidateQueries({
            queryKey: ["post-link-copies", String(tokenId)],
          });
        }
      });
    },
    [queryClient],
  );
}
