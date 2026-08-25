/**
 * Client for the `video-segments` edge function — crowdsourced sponsor reads,
 * intros, outros and the rest of what a viewer would rather skip.
 *
 * Reads are anonymous: the player skips for signed-out viewers too. Writes
 * carry the DeHub token in `x-dehub-token`; the function derives the submitter
 * from it and ignores anything we send, so no address goes in the body. The
 * `Authorization` header always holds the publishable key, because that is
 * what the platform's own JWT check reads — the DeHub token is not one.
 *
 * Every write is a POST, removal included: the shared CORS headers on these
 * functions allow GET, POST and OPTIONS only.
 *
 * Mirrors dehubweb `src/lib/api/video-segments.ts`; the two clients talk to
 * the same function and must agree on its contract.
 *
 * @module services/video-segments.service
 */

import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";

const FN_URL = `${env.SUPABASE_URL}/functions/v1/video-segments`;

export const SEGMENT_CATEGORIES = [
  "sponsor",
  "intro",
  "outro",
  "selfpromo",
  "interaction",
  "filler",
] as const;

export type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number];

export const SEGMENT_LABELS: Record<SegmentCategory, string> = {
  sponsor: "Sponsor",
  intro: "Intro",
  outro: "Outro",
  selfpromo: "Self promo",
  interaction: "Like & subscribe",
  filler: "Filler",
};

export interface VideoSegment {
  id: string;
  token_id: number;
  category: SegmentCategory;
  start_seconds: number;
  end_seconds: number;
  address: string;
  votes_up: number;
  votes_down: number;
  created_at: string;
}

/** Thrown when the function is unreachable — the UI treats it as "no segments". */
export class SegmentsUnavailableError extends Error {
  constructor() {
    super("Video segments are not available yet");
    this.name = "SegmentsUnavailableError";
  }
}

const anonHeaders = {
  apikey: env.SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
};

/** fetch, with "could not reach it at all" folded into the unavailable state. */
async function reach(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new SegmentsUnavailableError();
  }
  if (res.status === 404) throw new SegmentsUnavailableError();
  return res;
}

export async function fetchVideoSegments(tokenId: string | number): Promise<VideoSegment[]> {
  const res = await reach(`${FN_URL}?token_id=${encodeURIComponent(String(tokenId))}`, {
    headers: anonHeaders,
  });
  if (!res.ok) throw new Error(`Could not load segments (${res.status})`);

  const data = await res.json();
  // Numeric columns come back as strings over PostgREST, and the player does
  // arithmetic on them on every progress tick — coerce once, here.
  return (data?.segments ?? []).map((segment: VideoSegment) => ({
    ...segment,
    start_seconds: Number(segment.start_seconds),
    end_seconds: Number(segment.end_seconds),
  }));
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

export async function submitVideoSegment(input: {
  tokenId: string | number;
  category: SegmentCategory;
  startSeconds: number;
  endSeconds: number;
}): Promise<VideoSegment> {
  const data = await post({
    token_id: Number(input.tokenId),
    category: input.category,
    start_seconds: input.startSeconds,
    end_seconds: input.endSeconds,
  });
  return data.segment as VideoSegment;
}

/** 1 agrees, -1 disagrees, 0 withdraws your vote. */
export async function voteVideoSegment(segmentId: string, vote: 1 | -1 | 0): Promise<void> {
  await post({ segment_id: segmentId, vote });
}

export async function removeVideoSegment(segmentId: string): Promise<void> {
  await post({ remove_segment_id: segmentId });
}
