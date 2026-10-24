import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import NetInfo from "@react-native-community/netinfo";
import env from "../config/env";
import { getAuthToken } from "./auth.utils";
import { tokenRefreshManager } from "./token-refresh";
import { formatUploadErrorMessage, type XhrUploadError } from "./xhr-upload";
import { translateCopy as _translateCopy } from "../i18n/copy";

/**
 * Chunked, resumable uploads — the node-uploadx protocol PeerTube uses.
 *
 *   POST   {endpoint}  X-Upload-Content-Length + JSON metadata → 201, Location: …?upload_id=…
 *   PUT    Location    Content-Range: bytes a-b/size            → 308 Range: bytes=0-n, or 200 + result
 *   PUT    Location    Content-Range: bytes * /size (no body)   → where to carry on from
 *   DELETE Location                                             → cancel
 *
 * One multipart POST lost the whole video to a dropped connection, a switch
 * from wifi to cellular, the app going to the background or a token that
 * expired halfway. Here each chunk is its own request, so any of those costs
 * one chunk at most: the server says how much it holds and the upload carries
 * on from there — straight away when the app comes back to the foreground or
 * the network comes back.
 *
 * Each chunk is read from the file by offset and handed to a native upload
 * task from a scratch file, so a large video is never loaded whole, and the
 * bytes never cross the bridge as base64.
 */

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const API_BASE_URL = env.API_URL;
const API_ORIGIN = (/^https?:\/\/[^/]+/.exec(API_BASE_URL ?? "") ?? [API_BASE_URL])[0];

/** The file or the API cannot do this (old API, a non-file URI). Send it the old way instead. */
export class ResumableUnsupportedError extends Error {
  constructor(reason: string) {
    super(`Resumable upload unavailable: ${reason}`);
    this.name = "ResumableUnsupportedError";
  }
}

export interface ResumableUploadOptions {
  /** Path under the API base, e.g. "/draft_video/resumable". */
  endpoint: string;
  uri: string;
  name: string;
  mimeType: string;
  /** Sent with the file's name, type, size and modification time when the session is created. */
  metadata?: Record<string, unknown>;
  /** 0–1 across the whole file. */
  onProgress?: (fraction: number) => void;
  /** Set to true to cancel; the session is dropped on the server too. */
  abortRef?: { current: boolean };
  /** First retry delay; doubles per failure up to 30s. */
  retryBaseMs?: number;
}

export const MIN_CHUNK_BYTES = 256 * 1024;
export const FIRST_CHUNK_BYTES = 1024 * 1024;
/** Below web's 50 MB: each chunk is held in JS memory on its way to the scratch file. */
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
/** Chunks are sized so one takes about this long on the current connection. */
const TARGET_CHUNK_MS = 8_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_MS = 30_000;
/**
 * Give up once nothing has got through for this long. The post job waits on
 * this upload, so it is long enough to ride out a dropped connection, not an
 * hour: past it the post sends the file itself.
 */
const GIVE_UP_AFTER_MS = 10 * 60_000;
/** Consecutive 5xx answers before handing over to the single-request upload. */
const MAX_SERVER_ERRORS = 4;
/** A session that cannot even be opened this many times means the endpoint is unreachable, not the network. */
const CREATE_ATTEMPTS = 3;

interface Reply {
  status: number;
  header: (name: string) => string | null;
  text: string;
}

/** No answer: offline, dropped, timed out, suspended in the background. Retried after a pause. */
class TransientError extends Error {}
/** The token was refreshed after a 401: send again straight away. */
class RetryNowError extends TransientError {}
/** The server answered, with a 5xx. Retried, but only a few times in a row. */
class ServerError extends TransientError {}
/** The server no longer knows the session (expired after an hour idle): start a new one. */
class SessionGoneError extends Error {}
class CancelledError extends Error {
  constructor() {
    super("Upload cancelled");
  }
}

const baseHeaders = (token: string): Record<string, string> => ({
  Accept: "application/json",
  "X-Client-Type": "mobile",
  "X-Platform": Platform.OS,
  "X-App-Version": APP_VERSION,
  Authorization: `Bearer ${token}`,
});

const absolute = (location: string) => (/^https?:\/\//.test(location) ? location : `${API_ORIGIN}${location}`);

function request(
  method: string,
  url: string,
  token: string,
  opts: { headers?: Record<string, string>; body?: string | null; abortRef?: { current: boolean } } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      fn();
    };
    const watch = setInterval(() => {
      if (!opts.abortRef?.current) return;
      xhr.abort();
      settle(() => reject(new CancelledError()));
    }, 250);
    xhr.onload = () =>
      settle(() => resolve({ status: xhr.status, header: (name) => xhr.getResponseHeader(name), text: xhr.responseText }));
    xhr.onerror = () => settle(() => reject(new TransientError("network error")));
    xhr.ontimeout = () => settle(() => reject(new TransientError("timed out")));
    xhr.open(method, url);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    xhr.responseType = "text";
    for (const [key, value] of Object.entries({ ...baseHeaders(token), ...opts.headers })) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(opts.body ?? null);
  });
}

/** Bytes the server holds, from `Range: bytes=0-<last>`. No header (or `0--1`) is none. */
export function heldBytes(range: string | null | undefined): number {
  const match = /bytes=0-(\d+)/.exec(range ?? "");
  return match ? Number(match[1]) + 1 : 0;
}

/** Next chunk size: aim for TARGET_CHUNK_MS at the speed just seen, at most doubling or halving per step. */
export function nextChunkSize(current: number, sentBytes: number, elapsedMs: number): number {
  if (sentBytes <= 0 || elapsedMs <= 0) return current;
  const ideal = (sentBytes / elapsedMs) * TARGET_CHUNK_MS;
  const bounded = Math.min(current * 2, Math.max(current / 2, ideal));
  const rounded = Math.round(bounded / MIN_CHUNK_BYTES) * MIN_CHUNK_BYTES;
  return Math.min(MAX_CHUNK_BYTES, Math.max(MIN_CHUNK_BYTES, rounded));
}

/**
 * Pause before retrying. Ends early when the app comes back to the
 * foreground or the network comes back: a phone that was in a pocket or a
 * lift should not then sit out the rest of a backoff it started there.
 */
function waitToRetry(failures: number, baseMs: number, abortRef?: { current: boolean }): Promise<void> {
  const delay = Math.min(MAX_RETRY_MS, baseMs * 2 ** Math.min(failures - 1, 5)) * (0.75 + Math.random() * 0.5);
  return new Promise((resolve, reject) => {
    let done = false;
    let sawOffline = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(watch);
      appState.remove();
      stopNet();
      fn();
    };
    const timer = setTimeout(() => finish(resolve), delay);
    const watch = setInterval(() => {
      if (abortRef?.current) finish(() => reject(new CancelledError()));
    }, 250);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") finish(resolve);
    });
    // NetInfo reports the current state on subscribe; only a return from offline counts.
    const stopNet = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      if (!online) sawOffline = true;
      else if (sawOffline) finish(resolve);
    });
  });
}

function errorFrom(reply: Reply): XhrUploadError {
  let body: any;
  try {
    body = JSON.parse(reply.text);
  } catch {
    /* not JSON */
  }
  const err: XhrUploadError = new Error(formatUploadErrorMessage(body, _translateCopy("copy.c5fcf1849ea8", { defaultValue: "Upload failed ({{value1}})", value1: reply.status })));
  err.status = reply.status;
  if (typeof body?.code === "string") err.code = body.code;
  return err;
}

function resultFrom<T>(reply: Reply): T {
  try {
    const parsed = JSON.parse(reply.text);
    return (parsed?.result ?? parsed) as T;
  } catch {
    throw new Error("Invalid JSON response from server");
  }
}

const headerOf = (headers: Record<string, string> | undefined, name: string): string | null => {
  const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (headers as Record<string, string>)[key] : null;
};

/**
 * Upload a local video to a node-uploadx endpoint, resuming across dropped
 * connections, the app being backgrounded and token refreshes. Resolves with
 * the JSON the server sends after the last byte.
 *
 * Rejects with ResumableUnsupportedError before sending anything when the
 * file cannot be read in ranges or the API has no such endpoint.
 */
export async function resumableUploadFile<T = any>(opts: ResumableUploadOptions): Promise<T> {
  const { abortRef, onProgress, retryBaseMs = 1_000 } = opts;

  // Loaded here rather than at the top so nothing that merely imports this
  // module needs the native file system (tests, older binaries without it).
  let fs: typeof import("expo-file-system");
  let legacy: typeof import("expo-file-system/legacy");
  let source: import("expo-file-system").File;
  let size: number;
  try {
    fs = require("expo-file-system") as typeof import("expo-file-system");
    legacy = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
    if (!opts.uri.startsWith("file://")) throw new Error("not a file:// URI");
    source = new fs.File(opts.uri);
    size = source.size;
    if (!source.exists || !size) throw new Error("file is empty or missing");
    source.open().close();
  } catch (e) {
    throw new ResumableUnsupportedError((e as Error)?.message || "file cannot be read");
  }

  let token = "";
  let sessionUrl: string | null = null;
  let offset = 0;
  /** Offset unknown after a failure: ask before sending more. */
  let resync = false;
  let chunk = FIRST_CHUNK_BYTES;
  let failures = 0;
  let createFailures = 0;
  let restarts = 0;
  let authRetries = 0;
  let serverErrors = 0;
  let lastProgressAt = Date.now();
  let reported = -1;

  const report = (bytes: number) => {
    const fraction = Math.min(1, bytes / size);
    if (fraction > reported) {
      reported = fraction;
      onProgress?.(fraction);
    }
  };

  const signedOut = (): XhrUploadError => Object.assign(new Error(_translateCopy("copy.94f5e55e39ef", { defaultValue: "Session expired. Please sign in again." })), { status: 401 });

  /** A 401 means the token lapsed mid-upload: refresh and go on, or stop if the session is gone. */
  const reauthenticate = async () => {
    const fresh = await tokenRefreshManager.attemptRefresh();
    if (fresh) {
      token = fresh;
      return;
    }
    if (!(await getAuthToken())) throw signedOut();
    throw new TransientError("refresh failed");
  };

  const create = async (): Promise<{ url: string; resumed: boolean }> => {
    const reply = await request("POST", `${API_BASE_URL}${opts.endpoint}`, token, {
      abortRef,
      headers: {
        "Content-Type": "application/json",
        "X-Upload-Content-Length": String(size),
        "X-Upload-Content-Type": opts.mimeType || "application/octet-stream",
      },
      body: JSON.stringify({
        name: opts.name,
        mimeType: opts.mimeType,
        size,
        lastModified: source.modificationTime ?? undefined,
        ...opts.metadata,
      }),
    });
    if (reply.status === 200 || reply.status === 201) {
      const location = reply.header("Location");
      let id: string | undefined;
      try {
        id = JSON.parse(reply.text)?.uploadId;
      } catch {
        /* Location is enough */
      }
      const url = location
        ? absolute(location)
        : id
          ? `${API_BASE_URL}${opts.endpoint}?upload_id=${encodeURIComponent(id)}`
          : null;
      if (!url) throw new Error("Invalid JSON response from server");
      return { url, resumed: reply.status === 200 };
    }
    if (reply.status === 401) {
      await reauthenticate();
      throw new RetryNowError("retry with the new token");
    }
    if (reply.status === 404 || reply.status === 405) throw new ResumableUnsupportedError(`HTTP ${reply.status}`);
    if (reply.status >= 500 && reply.status !== 507) throw new ServerError(`HTTP ${reply.status}`);
    throw errorFrom(reply);
  };

  /** Every answer other than 308/200. Throws what the loop below acts on. */
  const handle = async (reply: Reply): Promise<never> => {
    if (reply.status === 401) {
      await reauthenticate();
      throw new RetryNowError("retry with the new token");
    }
    if (reply.status === 404) throw new SessionGoneError();
    if (reply.status >= 500) throw new ServerError(`HTTP ${reply.status}`);
    if (reply.status === 409 || reply.status === 0) throw new TransientError(`HTTP ${reply.status}`);
    throw errorFrom(reply);
  };

  /** What the server holds. `result` is set when it already has every byte. */
  const probe = async (): Promise<{ offset: number; result?: T }> => {
    const reply = await request("PUT", sessionUrl as string, token, {
      abortRef,
      headers: { "Content-Range": `bytes */${size}` },
    });
    if (reply.status === 200 || reply.status === 201) return { offset: size, result: resultFrom<T>(reply) };
    if (reply.status === 308) return { offset: heldBytes(reply.header("Range")) };
    return handle(reply);
  };

  /** One chunk, read by offset into a scratch file and sent by a native upload task. */
  const sendChunk = async (start: number, end: number): Promise<Reply> => {
    const scratch = new fs.File(
      fs.Paths.cache,
      `resumable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.part`,
    );
    try {
      const handle = source.open();
      try {
        handle.offset = start;
        scratch.create();
        scratch.write(handle.readBytes(end - start));
      } finally {
        handle.close();
      }
      const task = legacy.createUploadTask(
        sessionUrl as string,
        scratch.uri,
        {
          httpMethod: "PUT",
          uploadType: legacy.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            ...baseHeaders(token),
            "Content-Type": "application/octet-stream",
            "Content-Range": `bytes ${start}-${end - 1}/${size}`,
          },
        },
        (progress) => report(start + Math.min(progress.totalBytesSent, end - start)),
      );
      const watch = setInterval(() => {
        if (abortRef?.current) void task.cancelAsync().catch(() => {});
      }, 250);
      let result: Awaited<ReturnType<typeof task.uploadAsync>>;
      try {
        result = await task.uploadAsync();
      } catch (e) {
        throw new TransientError((e as Error)?.message || "network error");
      } finally {
        clearInterval(watch);
      }
      if (abortRef?.current) throw new CancelledError();
      if (!result) throw new TransientError("upload task ended without a response");
      return { status: result.status, header: (name) => headerOf(result?.headers, name), text: result.body ?? "" };
    } finally {
      try {
        if (scratch.exists) scratch.delete();
      } catch {
        /* the cache is cleared eventually */
      }
    }
  };

  const cancel = () => {
    if (!sessionUrl) return;
    void request("DELETE", sessionUrl, token).catch(() => {});
  };

  report(0);
  for (;;) {
    try {
      if (abortRef?.current) throw new CancelledError();
      await tokenRefreshManager.ensureFreshToken();
      const stored = await getAuthToken();
      if (!stored) throw signedOut();
      token = stored;

      if (!sessionUrl) {
        const created = await create().catch((err) => {
          if (err instanceof TransientError && !(err instanceof RetryNowError) && ++createFailures >= CREATE_ATTEMPTS) {
            // Down on the very first request looks the same as an API that
            // refuses this one. The old single-request upload answers both.
            throw new ResumableUnsupportedError("could not open a session");
          }
          throw err;
        });
        sessionUrl = created.url;
        offset = 0;
        resync = created.resumed;
      }

      if (resync || offset >= size) {
        const state = await probe();
        if (state.result !== undefined) {
          report(size);
          return state.result;
        }
        offset = state.offset;
        resync = false;
        report(offset);
      }

      const start = offset;
      const end = Math.min(start + chunk, size);
      const startedAt = Date.now();
      const reply = await sendChunk(start, end);

      if (reply.status === 200 || reply.status === 201) {
        report(size);
        return resultFrom<T>(reply);
      }
      if (reply.status !== 308) await handle(reply);

      offset = heldBytes(reply.header("Range"));
      // A 308 that does not move forward means the chunk did not land; ask again after a pause.
      if (offset <= start) throw new TransientError("no progress");
      chunk = nextChunkSize(chunk, offset - start, Date.now() - startedAt);
      failures = 0;
      authRetries = 0;
      serverErrors = 0;
      lastProgressAt = Date.now();
      report(offset);
    } catch (err) {
      if (err instanceof CancelledError) {
        cancel();
        throw err;
      }
      if (err instanceof SessionGoneError) {
        // Expired (an hour in the background) or swept: start again from byte zero.
        if (++restarts > 2) throw new Error(_translateCopy("copy.580bfac1001b", { defaultValue: "Upload failed — please check your connection and try again" }));
        sessionUrl = null;
        offset = 0;
        resync = false;
        continue;
      }
      if (err instanceof RetryNowError) {
        // A server that keeps refusing a token it has just issued will not change its mind.
        if (++authRetries > 3) throw signedOut();
        resync = sessionUrl !== null;
        continue;
      }
      if (!(err instanceof TransientError)) {
        if (!(err instanceof ResumableUnsupportedError)) cancel();
        throw err;
      }
      if (err instanceof ServerError && ++serverErrors >= MAX_SERVER_ERRORS) {
        // The old upload failed fast and fell back; a server that keeps
        // erroring should not hold the post for the whole retry window.
        cancel();
        throw new ResumableUnsupportedError("server keeps failing");
      }
      failures++;
      resync = true;
      chunk = Math.max(MIN_CHUNK_BYTES, Math.floor(chunk / 2 / MIN_CHUNK_BYTES) * MIN_CHUNK_BYTES);
      if (Date.now() - lastProgressAt > GIVE_UP_AFTER_MS) {
        cancel();
        throw new Error(_translateCopy("copy.580bfac1001b", { defaultValue: "Upload failed — please check your connection and try again" }));
      }
      await waitToRetry(failures, retryBaseMs, abortRef).catch((cancelled) => {
        cancel();
        throw cancelled;
      });
    }
  }
}
