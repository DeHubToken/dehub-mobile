/**
 * Client for the `film-reviews` edge function. Mirrors dehubweb's
 * src/lib/api/film-reviews.ts.
 *
 * Reads are anonymous. Writes carry the DeHub token; the function derives the
 * author from it and ignores any address sent, so none is put in the body.
 */
import env from '../config/env';
import { getAuthToken } from '../libs/auth.utils';
import type { ObjectType } from './justwatch.service';

const FN_URL = `${env.SUPABASE_URL}/functions/v1/film-reviews`;

export interface FilmReview {
  id: string;
  address: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
}

export interface FilmReviewSummary {
  average: number | null;
  count: number;
  /** Counts for 1 to 5 stars, in that order. */
  distribution: number[];
}

export interface FilmReviewsResponse {
  reviews: FilmReview[];
  summary: FilmReviewSummary;
}

/** The function is not deployed yet: the same pre-launch state the catalogue has. */
export class FilmReviewsUnavailableError extends Error {
  constructor() {
    super('Film reviews are not available yet');
    this.name = 'FilmReviewsUnavailableError';
  }
}

function target(justwatchId: string, objectType: ObjectType) {
  return `${FN_URL}?justwatch_id=${encodeURIComponent(justwatchId)}&object_type=${objectType}`;
}

function anonHeaders(): Record<string, string> {
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function reach(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new FilmReviewsUnavailableError();
  }
  if (res.status === 404) throw new FilmReviewsUnavailableError();
  return res;
}

export async function fetchFilmReviews(justwatchId: string, objectType: ObjectType): Promise<FilmReviewsResponse> {
  const res = await reach(target(justwatchId, objectType), { headers: anonHeaders() });
  if (!res.ok) throw new Error(`Could not load reviews (${res.status})`);
  return res.json();
}

export interface SaveFilmReviewInput {
  justwatchId: string;
  objectType: ObjectType;
  rating: number;
  body?: string;
  /** Snapshot so the review renders without a catalogue call. */
  title: string;
  poster?: string | null;
  year?: number | null;
}

export async function saveFilmReview(input: SaveFilmReviewInput): Promise<FilmReview> {
  const token = await getAuthToken();
  if (!token) throw new Error('SIGN_IN_REQUIRED');
  const res = await reach(target(input.justwatchId, input.objectType), {
    method: 'POST',
    headers: { ...anonHeaders(), 'Content-Type': 'application/json', 'x-dehub-token': token },
    body: JSON.stringify({
      rating: input.rating,
      body: input.body ?? '',
      title: input.title,
      poster: input.poster ?? null,
      year: input.year ?? null,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Could not save your review (${res.status})`);
  return data.review as FilmReview;
}

export async function deleteFilmReview(justwatchId: string, objectType: ObjectType): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new Error('SIGN_IN_REQUIRED');
  const res = await reach(target(justwatchId, objectType), {
    method: 'DELETE',
    headers: { ...anonHeaders(), 'x-dehub-token': token },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Could not remove your review (${res.status})`);
  }
}
