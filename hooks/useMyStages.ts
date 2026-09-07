/**
 * My stages — everything you host or hold a mic on
 * ================================================
 * Backs the "Hosting" tab on the Stages screen, which only exists for people
 * who actually run rooms. A port of dehubweb's `use-my-stages`, against the
 * same two sources, because hosting is recorded in two places and neither one
 * covers the other:
 *
 *  - `audio_spaces.host_wallet_address` is the only record of a *scheduled*
 *    stage you own. Nobody has joined it, so it has no participant rows at all.
 *  - `space_participants` is the only record of a stage you *spoke* on. Your
 *    wallet appears nowhere on the space row itself.
 *
 * Wallet columns are written lower-cased on some paths and checksummed on
 * others, so every comparison here is case-insensitive — an `.eq` on a
 * checksummed address silently returns nothing.
 *
 * Rows come back in the order the tab reads them: the room that is live right
 * now, then what you have announced, then the back catalogue newest-first.
 *
 * @module hooks/useMyStages
 */

import { useQuery } from "@tanstack/react-query";

import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import type { AudioSpace } from "./useStages";

export const myStagesKeys = {
  all: ["my-stages"] as const,
  forWallet: (wallet?: string | null) =>
    [...myStagesKeys.all, wallet?.toLowerCase() ?? null] as const,
};

/** Live first, then upcoming by start time, then ended newest-first. */
const STATUS_RANK: Record<string, number> = { live: 0, scheduled: 1, ended: 2 };

function sortKey(space: AudioSpace): number {
  // Scheduled stages sort by when they start (soonest first); everything else
  // by when it happened (most recent first), hence the sign flip.
  if (space.status === "scheduled") {
    return space.scheduled_at ? new Date(space.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
  }
  const stamp = space.ended_at || space.started_at || space.created_at;
  return stamp ? -new Date(stamp).getTime() : 0;
}

/**
 * Every stage the signed-in wallet hosts or speaks on, any status.
 *
 * `hasAny` is what gates the tab itself: a Hosting tab is meaningless to
 * somebody who has only ever listened, and a fourth tab that is always empty
 * costs everyone else width on a strip that already has to fit on a phone.
 */
export function useMyStages() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress || user?.address || "";

  const query = useQuery({
    queryKey: myStagesKeys.forWallet(walletAddress),
    enabled: !!walletAddress,
    staleTime: 60_000,
    queryFn: async (): Promise<AudioSpace[]> => {
      // Mic-holding rows first: a listener row must not put a stage in here,
      // and `left_at` is deliberately ignored — you hosted it whether or not
      // you are still in the room.
      const { data: seats, error: seatsError } = await supabase
        .from("space_participants")
        .select("space_id, role")
        .ilike("wallet_address", walletAddress)
        .in("role", ["host", "speaker"]);
      if (seatsError) throw seatsError;

      const seatIds = Array.from(
        new Set(
          ((seats ?? []) as { space_id?: string }[])
            .map((row) => row.space_id)
            .filter((id): id is string => !!id),
        ),
      );

      const owned = await supabase
        .from("audio_spaces")
        .select("*")
        .ilike("host_wallet_address", walletAddress);
      if (owned.error) throw owned.error;

      // A stage you host also carries a host participant row, so the two sets
      // overlap on nearly everything — collect into one map keyed by id.
      const byId = new Map<string, AudioSpace>();
      for (const space of (owned.data ?? []) as AudioSpace[]) {
        if (space?.id) byId.set(space.id, space);
      }

      if (seatIds.length) {
        const spokenOn = await supabase.from("audio_spaces").select("*").in("id", seatIds);
        if (spokenOn.error) throw spokenOn.error;
        for (const space of (spokenOn.data ?? []) as AudioSpace[]) {
          if (space?.id) byId.set(space.id, space);
        }
      }

      return Array.from(byId.values()).sort((a, b) => {
        const rank = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3);
        return rank !== 0 ? rank : sortKey(a) - sortKey(b);
      });
    },
  });

  const stages = query.data ?? [];

  return {
    stages,
    isLoading: query.isLoading,
    hasAny: stages.length > 0,
  };
}

export default useMyStages;
