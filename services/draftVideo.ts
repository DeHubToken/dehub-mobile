import { proxy } from "valtio";
import { apiClient } from "../libs";
import { xhrUploadFormData, type XhrUploadError } from "../libs/xhr-upload";
import { ResumableUnsupportedError, resumableUploadFile } from "../libs/resumable-upload";
import { onSocketEvent } from "../libs/socket-events";
import { toastError } from "../libs/toast";

/**
 * A video uploaded while the creator is still writing the post.
 *
 * The composer starts this the moment a video is attached, so by the time Post
 * is tapped the file is usually on the server and already transcoding. The
 * post then goes up with only the draft's id. Anything that goes wrong here
 * (old server, feature off, network) just marks the draft unusable and the
 * post uploads the file the old way — the creator never sees a failure from
 * this path on its own.
 *
 * In memory only: a draft whose upload was cut off by the app being killed is
 * gone, and the server expires abandoned ones after 24h.
 */
export type DraftVideoPhase =
  | "uploading"
  | "processing"
  | "ready"
  /** The server could not transcode it. The post sends the file instead. */
  | "failed"
  /** No draft (old server, feature off, network). The post sends the file. */
  | "unusable";

export interface DraftVideo {
  key: string;
  uri: string;
  phase: DraftVideoPhase;
  /** 0–1, the upload of the file itself. */
  uploadProgress: number;
  /** 0–100, the server's transcoding progress. */
  processProgress: number;
  draftId?: string;
  /** The upload job that posted with this draft; a claimed draft is not cancelled with the composer. */
  claimedBy?: string;
}

export const draftVideoState = proxy<{ drafts: Record<string, DraftVideo> }>({ drafts: {} });

const POLL_MS = 3_000;
/** Stop following a draft nobody posted with; the server expires it anyway. */
const WATCH_LIMIT_MS = 30 * 60_000;

interface DraftRuntime {
  abortRef: { current: boolean };
  /** Resolves with the draft id, or null when there is no usable draft. */
  uploaded: Promise<string | null>;
  stopWatch?: () => void;
}

const runtimes: Record<string, DraftRuntime> = {};

const draft = (key: string): DraftVideo | undefined => draftVideoState.drafts[key];

function settle(key: string, phase: DraftVideoPhase) {
  const d = draft(key);
  if (!d) return;
  d.phase = phase;
  if (phase === "ready") d.processProgress = 100;
  if (phase !== "processing") runtimes[key]?.stopWatch?.();
}

/** Follow transcoding over the socket, with a poll in case the socket is down. */
function watch(key: string, draftId: string) {
  const runtime = runtimes[key];
  if (!runtime) return;

  const apply = (stage: unknown, progress: unknown) => {
    const d = draft(key);
    if (!d || d.phase !== "processing") return;
    if (stage === "ready") return settle(key, "ready");
    if (stage === "failed") return settle(key, "failed");
    // Consumed by a post already: nothing more to prepare for this composer.
    if (stage === "used") return settle(key, "unusable");
    const n = Number(progress);
    if (Number.isFinite(n)) d.processProgress = Math.max(d.processProgress, Math.min(Math.round(n), 99));
  };

  const unsubscribe = onSocketEvent(`draft:${draftId}`, (data) => apply(data?.stage, data?.progress));
  const poll = setInterval(async () => {
    try {
      const res: any = await apiClient.get(`/draft_video/${encodeURIComponent(draftId)}`, { isAuthRequired: true });
      const body = res?.result ?? res;
      apply(body?.status, body?.progress);
    } catch {
      // The socket may still deliver; the next tick tries again.
    }
  }, POLL_MS);
  const limit = setTimeout(() => runtime.stopWatch?.(), WATCH_LIMIT_MS);

  runtime.stopWatch = () => {
    unsubscribe();
    clearInterval(poll);
    clearTimeout(limit);
    runtime.stopWatch = undefined;
  };
}

/**
 * Send the file in resumable chunks, so a dropped connection, a trip to the
 * background or a token refresh carries on from the last chunk the server
 * holds. A file that cannot be read in ranges, or an API without the
 * endpoint, gets the single multipart request it always did.
 */
async function sendDraftFile(
  media: { uri: string; name: string; mimeType: string },
  postType: "video" | "short",
  abortRef: { current: boolean },
  onProgress: (fraction: number) => void,
): Promise<any> {
  try {
    return await resumableUploadFile<any>({
      endpoint: "/draft_video/resumable",
      uri: media.uri,
      name: media.name,
      mimeType: media.mimeType,
      metadata: { postType },
      abortRef,
      onProgress,
    });
  } catch (e) {
    if (!(e instanceof ResumableUnsupportedError)) throw e;
  }
  const fd = new FormData();
  fd.append("postType", postType);
  // @ts-ignore RN FormData file shape
  fd.append("file", { uri: media.uri, name: media.name, type: media.mimeType } as any);
  return xhrUploadFormData<any>({ endpoint: "/draft_video", formData: fd, abortRef, onProgress });
}

/** Start uploading a just-attached video. Returns the handle the composer and the post use. */
export function startDraftVideo(
  media: { uri: string; name: string; mimeType: string },
  postType: "video" | "short" = "video",
): string {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  draftVideoState.drafts[key] = {
    key,
    uri: media.uri,
    phase: "uploading",
    uploadProgress: 0,
    processProgress: 0,
  };
  const abortRef = { current: false };

  const uploaded = (async (): Promise<string | null> => {
    try {
      const res = await sendDraftFile(media, postType, abortRef, (frac) => {
        const d = draft(key);
        if (d && frac > d.uploadProgress) d.uploadProgress = frac;
      });
      const draftId = res?.draftId ? String(res.draftId) : "";
      const d = draft(key);
      if (!d || abortRef.current) return null;
      if (!draftId) {
        d.phase = "unusable";
        return null;
      }
      d.draftId = draftId;
      d.uploadProgress = 1;
      d.phase = "processing";
      watch(key, draftId);
      return draftId;
    } catch (e) {
      if (abortRef.current) return null;
      const err = e as XhrUploadError;
      // Only an unreadable file is worth telling the creator about now: the
      // same file will not post either. Everything else (feature off, an
      // older server, the network) falls back to the normal upload silently.
      if (err.status === 400 && err.message) toastError(err.message);
      const d = draft(key);
      if (d) d.phase = err.status === 400 ? "failed" : "unusable";
      return null;
    }
  })();

  runtimes[key] = { abortRef, uploaded };
  return key;
}

/** Drop a draft the creator removed, replaced or walked away from. A posted one is kept. */
export function cancelDraftVideo(key: string | null | undefined) {
  if (!key) return;
  const d = draft(key);
  if (d?.claimedBy) return;
  releaseDraftVideo(key);
}

/** Stop everything for a draft and forget it. */
export function releaseDraftVideo(key: string | null | undefined) {
  if (!key) return;
  const runtime = runtimes[key];
  if (runtime) {
    runtime.abortRef.current = true;
    runtime.stopWatch?.();
    delete runtimes[key];
  }
  delete draftVideoState.drafts[key];
}

/**
 * Hand the composer's draft for this file to an upload job. Returns the key
 * and, when the upload has already finished, the draft id.
 */
export function claimDraftVideo(uri: string, jobId: string): { key: string; draftId?: string } | null {
  const d = Object.values(draftVideoState.drafts).find(
    (x) => x.uri === uri && !x.claimedBy && (x.phase === "uploading" || x.phase === "processing" || x.phase === "ready"),
  );
  if (!d) return null;
  d.claimedBy = jobId;
  return { key: d.key, draftId: d.draftId };
}

export function getDraftVideo(key: string | null | undefined): DraftVideo | undefined {
  return key ? draft(key) : undefined;
}

/**
 * Wait for a claimed draft's upload to finish, reporting its progress.
 *
 * Resolves with the draft id, or null when there is no usable draft — not in
 * this process (the app was restarted), the upload failed, or the server
 * could not transcode it. The caller then sends the file itself.
 */
export async function waitForDraftVideo(
  key: string,
  onProgress: (frac: number) => void,
  abortRef: { current: boolean },
): Promise<string | null> {
  const runtime = runtimes[key];
  if (!runtime) return null;
  const tick = setInterval(() => {
    const d = draft(key);
    if (d) onProgress(d.uploadProgress);
    if (abortRef.current) runtime.abortRef.current = true;
  }, 250);
  try {
    const draftId = await runtime.uploaded;
    const d = draft(key);
    if (!draftId || !d || d.phase === "failed" || d.phase === "unusable") return null;
    return draftId;
  } finally {
    clearInterval(tick);
  }
}
