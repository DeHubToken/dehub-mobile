/**
 * Viewer-submitted fixes to auto-caption lines, and the helper that applies
 * the accepted ones over a transcript before it is read or displayed.
 *
 * Mirrors dehubweb `src/hooks/use-transcript-corrections.ts` — the two clients
 * read the same rows, so a fix accepted on one is live on the other.
 *
 * @module hooks/useTranscriptCorrections
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toastError, toastSuccess } from "../libs";
import {
  CorrectionsUnavailableError,
  fetchTranscriptCorrections,
  removeTranscriptCorrection,
  submitTranscriptCorrection,
  voteTranscriptCorrection,
  type TranscriptCorrection,
} from "../services/transcript-corrections.service";
import type { TranscriptSegment } from "./useTranscript";

export type { TranscriptCorrection };

export function correctionsKey(transcriptId: string | null) {
  return ["transcript-corrections", transcriptId] as const;
}

export function useTranscriptCorrections(transcriptId: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: correctionsKey(transcriptId),
    queryFn: async () => {
      try {
        return await fetchTranscriptCorrections(transcriptId!);
      } catch (error) {
        // Unreachable reads as "no corrections", not as an error the viewer
        // has to see — the captions still play, just uncorrected.
        if (error instanceof CorrectionsUnavailableError) return [] as TranscriptCorrection[];
        throw error;
      }
    },
    enabled: enabled && !!transcriptId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const corrections = useMemo(() => query.data ?? [], [query.data]);

  /** Line index → the accepted fix for it. */
  const accepted = useMemo(() => {
    const map = new Map<number, TranscriptCorrection>();
    for (const correction of corrections) {
      if (correction.status !== "accepted") continue;
      const existing = map.get(correction.segment_index);
      // Most-supported wins if two fixes for one line are both accepted.
      if (
        !existing ||
        correction.votes_up - correction.votes_down >
          existing.votes_up - existing.votes_down
      ) {
        map.set(correction.segment_index, correction);
      }
    }
    return map;
  }, [corrections]);

  /** Line index → fixes still waiting on a second opinion. */
  const suggested = useMemo(() => {
    const map = new Map<number, TranscriptCorrection[]>();
    for (const correction of corrections) {
      if (correction.status !== "suggested") continue;
      const list = map.get(correction.segment_index) ?? [];
      list.push(correction);
      map.set(correction.segment_index, list);
    }
    return map;
  }, [corrections]);

  return { corrections, accepted, suggested, isLoading: query.isLoading };
}

/**
 * Replace corrected lines in a segment list. Returns the same array when there
 * is nothing to apply, so callers can keep it in a memo without churn.
 */
export function applyCorrections<T extends TranscriptSegment>(
  segments: T[],
  accepted: Map<number, TranscriptCorrection>,
): T[] {
  if (!accepted.size || !segments.length) return segments;
  return segments.map((segment, index) => {
    const fix = accepted.get(index);
    return fix ? { ...segment, text: fix.text } : segment;
  });
}

export function useCorrectionActions(transcriptId: string | null) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: correctionsKey(transcriptId) });
  }, [queryClient, transcriptId]);

  const submit = useMutation({
    mutationFn: (input: { segmentIndex: number; text: string; originalText: string }) =>
      submitTranscriptCorrection({ transcriptId: transcriptId!, ...input }),
    onSuccess: () => {
      invalidate();
      toastSuccess("Thanks — one more viewer agreeing puts it live");
    },
    onError: (error: Error) => toastError(error.message || "Could not save that correction"),
  });

  const vote = useMutation({
    mutationFn: ({ correctionId, value }: { correctionId: string; value: 1 | -1 | 0 }) =>
      voteTranscriptCorrection(correctionId, value),
    onSuccess: invalidate,
    onError: (error: Error) => toastError(error.message || "Could not record your vote"),
  });

  const remove = useMutation({
    mutationFn: (correctionId: string) => removeTranscriptCorrection(correctionId),
    onSuccess: () => {
      invalidate();
      toastSuccess("Removed");
    },
    onError: (error: Error) => toastError(error.message || "Could not remove that"),
  });

  return { submit, vote, remove };
}
