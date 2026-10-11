import { useQuery } from "@tanstack/react-query";
import { getStreamAudience, type LiveAudience } from "../services/live.service";

/**
 * Who is in a live room: host, watchers, top tippers, most active chatters.
 *
 * Polled rather than pushed: the room's sockets already carry each join and
 * gift as it happens, and this is the ranked view over all of them. Faster
 * while the sheet is open, slow while it only feeds the faces on the pill.
 */
export function useLiveAudience(streamId: string | null | undefined, opts: { open?: boolean; enabled?: boolean } = {}) {
  const enabled = !!streamId && opts.enabled !== false;
  return useQuery<LiveAudience>({
    queryKey: ["live-audience", streamId],
    queryFn: () => getStreamAudience(String(streamId)),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? (opts.open ? 8_000 : 30_000) : false,
  });
}
