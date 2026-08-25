/**
 * One transcript hook for every kind of thing DeHub transcribes.
 *
 * Mirrors dehubweb's `use-transcript`: read the row over PostgREST, follow it
 * over realtime, and call the `transcribe` function only to start one. Videos
 * and stages share the store, so a stage sheet and a video's subtitles read
 * the same tables and the same translation cache.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { createLogger } from "../libs/logger";

const logger = createLogger("useTranscript");

export type TranscriptKind = "video" | "stage" | "live" | "audio";

/** 'empty' is a finished run that found no speech. Separate from 'ready'
 *  because storing it as ready made it permanent — nothing could re-run it. */
export type TranscriptStatus =
  | "absent" | "pending" | "processing" | "ready" | "empty" | "failed";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptChapter {
  title: string;
  start: number;
  end: number;
}

export interface TranscriptRecord {
  id: string;
  source_kind: TranscriptKind;
  source_ref: string;
  status: Exclude<TranscriptStatus, "absent">;
  source_lang: string | null;
  duration_seconds: number | null;
  segments: TranscriptSegment[];
  full_text: string | null;
  vtt: string | null;
  summary: string | null;
  summary_status: string;
  chapters: TranscriptChapter[];
  speaker_map: Record<string, unknown>;
  speaker_overrides: Record<string, { username?: string }>;
  visibility: "public" | "members" | "private";
  attempts: number;
  error: string | null;
  updated_at: string;
}

const COLUMNS =
  "id, source_kind, source_ref, status, source_lang, duration_seconds, segments, " +
  "full_text, vtt, summary, summary_status, chapters, speaker_map, speaker_overrides, " +
  "visibility, attempts, error, updated_at";

function coerce(row: any): TranscriptRecord {
  return {
    ...row,
    segments: Array.isArray(row?.segments) ? row.segments : [],
    chapters: Array.isArray(row?.chapters) ? row.chapters : [],
    speaker_map: row?.speaker_map ?? {},
    speaker_overrides: row?.speaker_overrides ?? {},
  } as TranscriptRecord;
}

export function transcriptKey(kind: TranscriptKind, ref: string | null) {
  return ["transcript", kind, ref] as const;
}

export function useTranscript(
  kind: TranscriptKind,
  ref: string | null,
  enabled = true,
) {
  const qc = useQueryClient();
  const key = transcriptKey(kind, ref);
  const active = !!ref && enabled;

  const query = useQuery<TranscriptRecord | null>({
    queryKey: key,
    enabled: active,
    // A finished transcript never changes on its own. Only an in-flight one is
    // worth a backstop poll behind the realtime subscription.
    refetchInterval: (q) => {
      const s = (q.state.data as TranscriptRecord | null)?.status;
      return s === "pending" || s === "processing" ? 8000 : false;
    },
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcripts")
        .select(COLUMNS)
        .eq("source_kind", kind)
        .eq("source_ref", ref!)
        .maybeSingle();
      if (error) throw error;
      return data ? coerce(data) : null;
    },
  });

  const status: TranscriptStatus = query.data?.status ?? "absent";
  const inFlight = status === "pending" || status === "processing";

  useEffect(() => {
    if (!active || !ref) return;
    if (!inFlight && status !== "absent") return;

    const channel = supabase
      .channel(`transcript-${kind}-${ref}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transcripts", filter: `source_ref=eq.${ref}` },
        (payload) => {
          const row = payload.new as any;
          if (!row || row.source_kind !== kind) return;
          qc.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // `key` is derived from kind + ref, both already dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, kind, ref, inFlight, status, qc]);

  const start = useCallback(
    async (force = false) => {
      if (!ref) return;
      try {
        await supabase.functions.invoke("transcribe", {
          body: { kind, ref, action: "start", force },
        });
        qc.invalidateQueries({ queryKey: key });
      } catch (e) {
        logger.warn("could not start transcription", e);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [kind, ref, qc],
  );

  /** Whether asking again could produce anything different. */
  const canRetry = useMemo(() => {
    if (!query.data) return true;
    if (query.data.status === "ready") return false;
    return query.data.attempts < 5;
  }, [query.data]);

  return {
    transcript: query.data ?? null,
    status,
    inFlight,
    canRetry,
    isLoading: query.isLoading,
    refetch: query.refetch,
    start,
  };
}

/* ───────────────────────────── translations ─────────────────────────────── */

export interface TranslationRecord {
  status: "processing" | "ready" | "failed";
  segments: TranscriptSegment[];
  summary: string | null;
  chapters: TranscriptChapter[];
  error: string | null;
}

export function useTranscriptTranslation(
  transcriptId: string | null,
  language: string,
  enabled: boolean,
) {
  const qc = useQueryClient();
  const wanted = enabled && !!transcriptId && !!language && language !== "original";
  const key = ["transcript-translation", transcriptId, language] as const;
  const [requested, setRequested] = useState<string | null>(null);

  const query = useQuery<TranslationRecord | null>({
    queryKey: key,
    enabled: wanted,
    // Immutable once ready. This is the cache that makes the second viewer of
    // a language free.
    staleTime: 60 * 60_000,
    refetchInterval: (q) =>
      (q.state.data as TranslationRecord | null)?.status === "processing" ? 3000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcript_translations")
        .select("status, segments, summary, chapters, error")
        .eq("transcript_id", transcriptId!)
        .eq("language", language)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        segments: Array.isArray((data as any).segments) ? (data as any).segments : [],
        chapters: Array.isArray((data as any).chapters) ? (data as any).chapters : [],
      } as unknown as TranslationRecord;
    },
  });

  // Ask once per language, and only for one nobody has cached.
  useEffect(() => {
    if (!wanted || !transcriptId) return;
    if (query.isLoading) return;
    const s = query.data?.status;
    if (s === "ready" || s === "processing") return;
    const token = `${transcriptId}:${language}`;
    if (requested === token) return;
    setRequested(token);
    supabase.functions
      .invoke("translate-transcript", { body: { transcriptId, lang: language } })
      .then(() => qc.invalidateQueries({ queryKey: key }))
      .catch((e) => logger.warn("translate invoke failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, transcriptId, language, query.data?.status, query.isLoading, requested]);

  return { translation: query.data ?? null, isLoading: query.isLoading };
}
