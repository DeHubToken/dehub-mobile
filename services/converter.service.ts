/**
 * The converter — import a video from another platform as a DeHub post.
 * =====================================================================
 * Native side of dehub.io/converter. The endpoint is still called
 * `youtube_import` because that is what it was when it only took YouTube;
 * renaming it would break every queued job and the web client mid-deploy for
 * nothing a creator can see.
 *
 * The queue IS the record. There is no table behind this — the backend reads
 * Bull directly — so a job that is waiting out a rate limit, running, or
 * finished is all one list, and the screen polls it rather than each job.
 */
import { apiClient } from '../libs/api.client';

export interface ConverterImportParams {
  url: string;
  /** Publish as a video post, an audio one, or a picture post. Omitted means
   * the source's own default, which is what every client sent before the
   * choice existed. */
  mediaKind?: 'video' | 'audio' | 'image';
  /** No ownership check is possible from a URL, so this is the liability
   * gate. The API rejects the request without it. */
  ownershipConfirmed: boolean;
  /** Title and description from the review sheet. Empty means "use the
   * source's own title", which is what clearing the box asks for. */
  name?: string;
  description?: string;
  chainId?: number;
}

export interface ConverterQueuedResponse {
  queued: true;
  jobId: string | number;
}

export interface ConverterImport {
  jobId: string | number;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  /** The link that was pasted. */
  url?: string;
  /** Which supported source it came from — `youtube`, `tiktok`, … */
  sourceId?: string;
  /** What this job publishes as. */
  mediaKind?: 'video' | 'audio' | 'image';
  /** How that source names itself. The server owns the list, so the tile
   * renders what it is told rather than looking the id up locally. */
  sourceLabel?: string;
  /** YouTube only, and null everywhere else — enough on its own to draw a
   * thumbnail, since `i.ytimg.com/vi/<id>/mqdefault.jpg` needs no API call. */
  youtubeVideoId?: string | null;
  /** The source's own still. Arrives with the metadata part-way through, so
   * a non-YouTube tile has no art until the download starts. */
  thumbnailUrl?: string;
  /** Arrives once yt-dlp has read the metadata. */
  title?: string;
  phase?: 'queued' | 'downloading' | 'processing' | 'publishing';
  /** 0–100 across the whole import, not just the download. */
  percent?: number;
  /** Waiting on the source rather than waiting its turn. */
  rateLimited?: boolean;
  attemptsMade?: number;
  attempts?: number;
  /** The backend's own answer to "is this over?" — a rate-limited job sits in
   * `delayed` and runs again, a discarded one sits in `failed` and never
   * will, and no client should have to know Bull's rules to tell them apart. */
  willRetry?: boolean;
  queuedAt?: number;
  result?: { createdTokenId?: string; duplicate?: boolean; [key: string]: unknown };
  failedReason?: string;
}

/** What a link is, read without downloading it. */
export interface ConverterPreview {
  title: string;
  description: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  sourceId: string;
  sourceLabel: string;
  /** Which kinds this link offers, best-first. Served by the API so a source
   * whose capabilities change does not need an app release to match. */
  media: ('video' | 'audio' | 'image')[];
  isLive: boolean;
  /** The preview could not read the link. The fields are empty and importing
   * still works — the queue retries on its own schedule and the server falls
   * back to the source's own title. */
  unavailable?: boolean;
}

/**
 * Metadata for a link, so the review sheet can open already filled in.
 *
 * No download, no queue, no charge. A rejection means "open the sheet empty",
 * not "the import failed" — a slow metadata fetch must not read as a broken
 * importer.
 */
export async function previewConverterImport(url: string): Promise<ConverterPreview> {
  return apiClient.post<ConverterPreview>('/youtube_import/preview', { url });
}

export async function queueConverterImport(
  params: ConverterImportParams,
): Promise<ConverterQueuedResponse> {
  return apiClient.post<ConverterQueuedResponse>('/youtube_import', params);
}

/**
 * Everything this creator has imported lately, newest first.
 *
 * One call for the whole queue rather than a poll per job: an import waiting
 * out a rate limit can sit there for the best part of an hour, and a creator
 * is invited to queue more while it does.
 */
export async function listConverterImports(): Promise<ConverterImport[]> {
  const res = await apiClient.get<{ imports: ConverterImport[] }>('/youtube_import');
  return res?.imports ?? [];
}
