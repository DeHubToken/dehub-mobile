import { useQuery } from "@tanstack/react-query";
import { getStreamOverlay } from "../services/live.service";
import type { PublicOverlay } from "../libs/live-overlay/types";

export const streamOverlayKey = (streamId: string | null | undefined) => ["stream-overlay", streamId] as const;

/**
 * The creator's overlay for a stream the viewer is watching. The twin of
 * dehubweb src/hooks/use-stream-overlay.ts.
 *
 * Fetched once per stream and refetched when the creator saves (the layer
 * invalidates this key on `stream.overlay.updated`), so nothing polls.
 */
export function useStreamOverlay(streamId: string | null | undefined, enabled: boolean) {
  return useQuery<PublicOverlay>({
    queryKey: streamOverlayKey(streamId),
    queryFn: () => getStreamOverlay(String(streamId)),
    enabled: !!streamId && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
