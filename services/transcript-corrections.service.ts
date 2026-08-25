/**
 * Client for the `transcript-corrections` edge function — viewer-submitted
 * fixes to auto-caption lines.
 *
 * Auto-captions mangle accents, cross-talk, names and jargon, and the person
 * who can hear the difference is usually watching rather than the one who
 * uploaded it. This is the path by which that person can fix the line.
 *
 * Corrections are keyed on the line's index, not its text: a transcript can be
 * re-run, and matching on text would drop every fix the moment a re-run
 * shifted a word.
 *
 * Reads are anonymous; writes carry the DeHub token in `x-dehub-token` and the
 * function derives the submitter from it. `Authorization` always holds the
 * publishable key — that is what the platform's own check reads.
 *
 * Mirrors dehubweb `src/lib/api/transcript-corrections.ts`.
 *
 * @module services/transcript-corrections.service
 */

import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";

const FN_URL = `${env.SUPABASE_URL}/functions/v1/transcript-corrections`;

export interface TranscriptCorrection {
  id: string;
  transcript_id: string;
  segment_index: number;
  original_text: string;
  text: string;
  address: string;
  votes_up: number;
  votes_down: number;
  status: "suggested" | "accepted" | "rejected";
  created_at: string;
}

/** Thrown when the function is unreachable — the UI treats it as "no fixes". */
export class CorrectionsUnavailableError extends Error {
  constructor() {
    super("Transcript corrections are not available yet");
    this.name = "CorrectionsUnavailableError";
  }
}

const anonHeaders = {
  apikey: env.SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
};

async function reach(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new CorrectionsUnavailableError();
  }
  if (res.status === 404) throw new CorrectionsUnavailableError();
  return res;
}

export async function fetchTranscriptCorrections(
  transcriptId: string,
): Promise<TranscriptCorrection[]> {
  const res = await reach(`${FN_URL}?transcript_id=${encodeURIComponent(transcriptId)}`, {
    headers: anonHeaders,
  });
  if (!res.ok) throw new Error(`Could not load corrections (${res.status})`);

  const data = await res.json();
  return (data?.corrections ?? []) as TranscriptCorrection[];
}

async function post(body: Record<string, unknown>): Promise<any> {
  const token = await getAuthToken();
  if (!token) throw new Error("Sign in first.");

  const res = await reach(FN_URL, {
    method: "POST",
    headers: { ...anonHeaders, "Content-Type": "application/json", "x-dehub-token": token },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export async function submitTranscriptCorrection(input: {
  transcriptId: string;
  segmentIndex: number;
  text: string;
  originalText: string;
}): Promise<TranscriptCorrection> {
  const data = await post({
    transcript_id: input.transcriptId,
    segment_index: input.segmentIndex,
    text: input.text,
    original_text: input.originalText,
  });
  return data.correction as TranscriptCorrection;
}

/** 1 agrees, -1 disagrees, 0 withdraws your vote. */
export async function voteTranscriptCorrection(
  correctionId: string,
  vote: 1 | -1 | 0,
): Promise<void> {
  await post({ correction_id: correctionId, vote });
}

export async function removeTranscriptCorrection(correctionId: string): Promise<void> {
  await post({ remove_correction_id: correctionId });
}
