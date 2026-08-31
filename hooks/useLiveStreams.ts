/**
 * useLiveStreams
 * ==============
 * The stream rows behind live posts, keyed by the token they were minted
 * against.
 *
 * `/feed?postType=live` returns live POSTS — tokens — and nothing about the
 * broadcast: no status, no playbackId, no poster, no stream id. So a live card
 * built from the feed alone cannot say whether it is running, cannot show a
 * frame of it, and cannot even open the viewer, because the viewer is
 * addressed by stream id. It renders as a titled grey box that goes nowhere,
 * which is what the Live tab was made of.
 *
 * `/live` is the same list web's Live tab reads (`useDeHubLive`), and it
 * carries all of that. It is small — every stream the platform has, in one
 * response — so one request covers the whole feed rather than a lookup per
 * row.
 *
 * The endpoint ignores `page` entirely: asking for page 2 returns page 1
 * again. `complete` is therefore about `unit` alone — whether the response was
 * short enough to be the whole set. Callers use it to decide whether a live
 * post with no stream row here is genuinely stranded or merely past the
 * ceiling.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLiveVideos, type LiveStreamEntity } from "../services/live.service";

/**
 * Ceiling on rows fetched. Well above the real count (the platform has tens of
 * streams, not thousands) so `complete` is true in practice, while still
 * bounding the response if that ever stops being so.
 */
const UNIT = 200;

export interface LiveStreamIndex {
  /** tokenId (as a string) -> its stream row. */
  byToken: Map<string, LiveStreamEntity>;
  /**
   * Whether this is every stream there is. False when the fetch failed or the
   * response filled `unit` — in which case a missing row proves nothing.
   */
  complete: boolean;
}

const EMPTY: LiveStreamIndex = { byToken: new Map(), complete: false };

export function useLiveStreams(enabled = true): LiveStreamIndex {
  const { data } = useQuery({
    queryKey: ["dehub-live-streams", UNIT],
    queryFn: () => getLiveVideos({ unit: UNIT }),
    enabled,
    // Matches web's /api/live window. A stream going live is worth seeing
    // within a minute; a pull-to-refresh gets it sooner.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  return useMemo(() => {
    // The controller answers with a bare array; the envelope is only there on
    // some deployments. Both shapes have shipped, so read both.
    const rows: LiveStreamEntity[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.result)
        ? (data as any).result
        : [];
    if (!rows.length) return data ? { byToken: new Map(), complete: true } : EMPTY;

    const byToken = new Map<string, LiveStreamEntity>();
    for (const row of rows) {
      if (row?.tokenId == null) continue;
      const key = String(row.tokenId);
      const existing = byToken.get(key);
      // One token can carry several attempts at the same broadcast. The one
      // that is running wins, then the one that actually aired, so a card
      // never advertises a retry that never started over the take people
      // watched.
      if (!existing || rank(row) > rank(existing)) byToken.set(key, row);
    }
    return { byToken, complete: rows.length < UNIT };
  }, [data]);
}

function rank(row: LiveStreamEntity): number {
  const status = String(row?.status ?? "").toUpperCase();
  if (status === "LIVE" || status === "PAUSED") return 3;
  if (row?.startedAt) return 2;
  if (status === "SCHEDULED") return 1;
  return 0;
}

export default useLiveStreams;
