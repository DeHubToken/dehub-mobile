/**
 * A creator's streamer ladder — level, XP, streak and cards — from the
 * backend, which derives it from their ended streams. It only moves when a
 * stream ends, so a minute of staleness is invisible.
 */
import { useQuery } from "@tanstack/react-query";
import { getStreamerProgress, type StreamerProgress } from "../services/live.service";

export const streamerProgressKey = (address?: string | null) =>
  ["streamer-progress", address ? address.toLowerCase() : null] as const;

export function useStreamerProgress(address?: string | null) {
  return useQuery<StreamerProgress>({
    queryKey: streamerProgressKey(address),
    queryFn: () => getStreamerProgress(address as string),
    enabled: !!address,
    staleTime: 60 * 1000,
  });
}
