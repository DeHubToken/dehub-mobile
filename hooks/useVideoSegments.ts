/**
 * The read side of crowdsourced sponsor skipping.
 *
 * `enabled` is the whole cost control: the list is fetched only when the
 * viewer has skipping on and a video is actually attached. Fetching it for
 * every card in a feed would be a request per card for a feature most people
 * leave off.
 *
 * Mirrors dehubweb `src/hooks/use-video-segments.ts`.
 *
 * @module hooks/useVideoSegments
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toastError, toastSuccess } from "../libs";
import {
  fetchVideoSegments,
  removeVideoSegment,
  submitVideoSegment,
  voteVideoSegment,
  SegmentsUnavailableError,
  type SegmentCategory,
  type VideoSegment,
} from "../services/video-segments.service";

export type { VideoSegment, SegmentCategory };

export function videoSegmentsKey(tokenId: string | number) {
  return ["video-segments", String(tokenId)] as const;
}

export function useVideoSegments(tokenId: string | number | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: videoSegmentsKey(tokenId ?? ""),
    queryFn: async () => {
      try {
        return await fetchVideoSegments(tokenId!);
      } catch (error) {
        // Unreachable reads as "no segments", not as an error the viewer has
        // to see: a video with nobody's markers on it looks the same either
        // way, and there is nothing they could do about it.
        if (error instanceof SegmentsUnavailableError) return [] as VideoSegment[];
        throw error;
      }
    },
    enabled: enabled && !!tokenId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Sorted and merged: two people marking the same sponsor read a second apart
  // would otherwise skip twice, and a nested segment would fight the outer one.
  const segments = useMemo(() => mergeSegments(query.data ?? []), [query.data]);

  return { segments, isLoading: query.isLoading };
}

/** Overlapping or adjacent segments collapse into one. */
export function mergeSegments(segments: VideoSegment[]): VideoSegment[] {
  const sorted = [...segments].sort((a, b) => a.start_seconds - b.start_seconds);
  const merged: VideoSegment[] = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (last && segment.start_seconds <= last.end_seconds + 1) {
      // Keep the wider span and the better-supported label.
      merged[merged.length - 1] = {
        ...(segment.votes_up - segment.votes_down > last.votes_up - last.votes_down
          ? segment
          : last),
        start_seconds: Math.min(last.start_seconds, segment.start_seconds),
        end_seconds: Math.max(last.end_seconds, segment.end_seconds),
      };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

/** The segment covering `time`, if any. Linear — the list is a handful of rows. */
export function segmentAt(segments: VideoSegment[], time: number): VideoSegment | null {
  for (const segment of segments) {
    if (time >= segment.start_seconds && time < segment.end_seconds - 0.2) return segment;
  }
  return null;
}

export function useSegmentActions(tokenId: string | number | undefined) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    if (tokenId) queryClient.invalidateQueries({ queryKey: videoSegmentsKey(tokenId) });
  }, [queryClient, tokenId]);

  const submit = useMutation({
    mutationFn: (input: { category: SegmentCategory; startSeconds: number; endSeconds: number }) =>
      submitVideoSegment({ tokenId: tokenId!, ...input }),
    onSuccess: () => {
      invalidate();
      toastSuccess("Thanks — that section is marked for everyone");
    },
    onError: (error: Error) => toastError(error.message || "Could not save that section"),
  });

  const vote = useMutation({
    mutationFn: ({ segmentId, value }: { segmentId: string; value: 1 | -1 | 0 }) =>
      voteVideoSegment(segmentId, value),
    onSuccess: invalidate,
    onError: (error: Error) => toastError(error.message || "Could not record your vote"),
  });

  const remove = useMutation({
    mutationFn: (segmentId: string) => removeVideoSegment(segmentId),
    onSuccess: () => {
      invalidate();
      toastSuccess("Removed");
    },
    onError: (error: Error) => toastError(error.message || "Could not remove that"),
  });

  return { submit, vote, remove };
}
