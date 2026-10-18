/**
 * File plumbing for encrypted DM attachments: seal a local file into a
 * ciphertext file for upload, and download + open a ciphertext from the CDN
 * into a plaintext file in the cache.
 *
 * Both directions stream through the file a megabyte at a time with the
 * chunk primitives in media.ts, so a 50 MB video never sits in memory whole
 * and the JS thread gets an await between every piece. The bytes written are
 * exactly what encryptMediaBytes / decryptMediaBytes produce.
 *
 * Only expo-file-system/legacy calls the app already makes elsewhere are used
 * (getInfoAsync, read/writeAsStringAsync with position/length/append,
 * createDownloadResumable, copyAsync, moveAsync, deleteAsync,
 * makeDirectoryAsync), and the StorageAccessFramework save mirrors
 * saveEditorDownload.
 */
import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2";
import { buildCdnPath } from "../misc";
import {
  CHUNK_BYTES,
  MEDIA_HEADER_BYTES,
  SEALED_CHUNK_BYTES,
  mediaChunkCount,
  newMediaHeader,
  openMediaChunk,
  readMediaHeader,
  sealMediaChunk,
  fileKeyOf,
  type MediaDescriptor,
} from "./media";

/** Chunks handled per file read/write — 1 MiB of plaintext. */
const PIECE_CHUNKS = 16;
const TAG_BYTES = SEALED_CHUNK_BYTES - CHUNK_BYTES;

const cacheRoot = (): string => `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}`;
const decryptedDir = (): string => `${cacheRoot()}dm-e2ee/`;
const uploadDir = (): string => `${cacheRoot()}dm-e2ee-up/`;

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
const fromB64 = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, "base64"));

async function ensureDir(dir: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) return;
  } catch { /* fall through and try to create it */ }
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
}

async function readRange(uri: string, position: number, length: number): Promise<Uint8Array> {
  if (length <= 0) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let got = 0;
  // Android's ranged read is a single InputStream.read, which may return less
  // than asked; keep reading until the range is complete.
  while (got < length) {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: position + got,
      length: length - got,
    });
    const bytes = fromB64(b64);
    if (!bytes.length) throw new Error("Short read");
    parts.push(bytes);
    got += bytes.length;
  }
  return parts.length === 1 ? parts[0] : concat(parts);
}

async function appendBytes(uri: string, bytes: Uint8Array, append: boolean): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, toB64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
    append,
  });
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let w = 0;
  for (const p of parts) {
    out.set(p, w);
    w += p.length;
  }
  return out;
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  const size = (info as { size?: number }).size;
  if (!info.exists || typeof size !== "number") throw new Error("File unavailable");
  return size;
}

const randomName = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function deleteQuietly(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/**
 * Seal a local file into a fresh ciphertext file in the cache. The caller
 * deletes the returned file once it is uploaded.
 */
export async function encryptFileToCache(
  srcUri: string,
  fileKey: Uint8Array,
): Promise<{ uri: string; size: number; plainSize: number }> {
  let src = srcUri;
  let copied: string | null = null;
  await ensureDir(uploadDir());
  try {
    // Ranged reads need a plain file path; content:// and friends get copied first.
    if (!src.startsWith("file://") && !src.startsWith("/")) {
      copied = `${uploadDir()}${randomName()}.src`;
      await FileSystem.copyAsync({ from: src, to: copied });
      src = copied;
    }
    const plainSize = await fileSize(src);
    const out = `${uploadDir()}${randomName()}.bin`;
    const { header, prefix } = newMediaHeader();
    await appendBytes(out, header, false);
    const chunks = mediaChunkCount(plainSize);
    try {
      for (let i = 0; i < chunks; i += PIECE_CHUNKS) {
        const start = i * CHUNK_BYTES;
        const plain = await readRange(src, start, Math.min(PIECE_CHUNKS * CHUNK_BYTES, plainSize - start));
        const sealed: Uint8Array[] = [];
        for (let j = 0; j < PIECE_CHUNKS && i + j < chunks; j++) {
          const part = plain.subarray(j * CHUNK_BYTES, Math.min(plain.length, (j + 1) * CHUNK_BYTES));
          sealed.push(sealMediaChunk(fileKey, prefix, i + j, i + j === chunks - 1, part));
        }
        await appendBytes(out, concat(sealed), true);
      }
    } catch (e) {
      await deleteQuietly(out);
      throw e;
    }
    return { uri: out, size: await fileSize(out), plainSize };
  } finally {
    await deleteQuietly(copied);
  }
}

// ─── Receive side ──────────────────────────────────────────────────────────

/** The raw CDN object for a mediaUrls entry — never the image resizer, which cannot read ciphertext. */
export function encryptedMediaUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return buildCdnPath(raw) ?? null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

/** A filesystem-safe name for the plaintext: the sender's name for files, else media.<ext>. */
export function plaintextFileName(d: MediaDescriptor): string {
  const fromName = (d.name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);
  if (fromName) return fromName;
  const mime = (d.mime || "").toLowerCase().split(";")[0];
  const ext = EXT_BY_MIME[mime] || mime.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  return `media.${ext}`;
}

const hashHex = (s: string): string => Buffer.from(sha256(new Uint8Array(Buffer.from(s, "utf8")))).toString("hex").slice(0, 32);

function cachePathFor(url: string, d: MediaDescriptor): { dir: string; file: string } {
  const dir = `${decryptedDir()}${hashHex(url)}/`;
  return { dir, file: `${dir}${plaintextFileName(d)}` };
}

/** Local plaintext this device just sent, keyed by server message id, so the sender never re-downloads it. */
const localPlaintext = new Map<string, string>();

export function rememberLocalPlaintext(messageId: string, uri: string): void {
  if (messageId && uri) localPlaintext.set(messageId, uri);
}

type Listener = (progress: number) => void;
interface Job {
  promise: Promise<string>;
  listeners: Set<Listener>;
  progress: number;
}
const jobs = new Map<string, Job>();

// At most two attachments open at once; the rest wait their turn.
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** The cached plaintext for this attachment, if it was already opened. */
export async function cachedPlaintext(url: string, d: MediaDescriptor): Promise<string | null> {
  try {
    const { file } = cachePathFor(url, d);
    const info = await FileSystem.getInfoAsync(file);
    return info.exists ? file : null;
  } catch {
    return null;
  }
}

async function decryptFile(src: string, dst: string, key: Uint8Array, report: (p: number) => void): Promise<void> {
  const size = await fileSize(src);
  if (size < MEDIA_HEADER_BYTES + TAG_BYTES) throw new Error("Encrypted file too short");
  const prefix = readMediaHeader(await readRange(src, 0, MEDIA_HEADER_BYTES));
  const body = size - MEDIA_HEADER_BYTES;
  const chunks = Math.ceil(body / SEALED_CHUNK_BYTES);
  for (let i = 0; i < chunks; i += PIECE_CHUNKS) {
    const start = MEDIA_HEADER_BYTES + i * SEALED_CHUNK_BYTES;
    const piece = await readRange(src, start, Math.min(PIECE_CHUNKS * SEALED_CHUNK_BYTES, size - start));
    const opened: Uint8Array[] = [];
    for (let j = 0; j < PIECE_CHUNKS && i + j < chunks; j++) {
      const sealed = piece.subarray(j * SEALED_CHUNK_BYTES, Math.min(piece.length, (j + 1) * SEALED_CHUNK_BYTES));
      opened.push(openMediaChunk(key, prefix, i + j, i + j === chunks - 1, sealed));
    }
    await appendBytes(dst, concat(opened), i > 0);
    report(Math.min(1, (i + PIECE_CHUNKS) / chunks));
  }
}

/**
 * Download, open and cache an encrypted attachment. Resolves to a file:// uri
 * of the plaintext; rejects on a network failure, a wrong key or a tampered or
 * truncated file. Concurrent calls for the same url share one job.
 */
export function openEncryptedMedia(params: {
  url: string;
  descriptor: MediaDescriptor;
  messageId?: string;
  onProgress?: Listener;
}): Promise<string> {
  const { url, descriptor, messageId, onProgress } = params;
  const existing = jobs.get(url);
  if (existing) {
    if (onProgress) {
      existing.listeners.add(onProgress);
      onProgress(existing.progress);
      existing.promise.finally(() => existing.listeners.delete(onProgress)).catch(() => {});
    }
    return existing.promise;
  }
  const job: Job = { promise: Promise.resolve(""), listeners: new Set(onProgress ? [onProgress] : []), progress: 0 };
  const report = (p: number) => {
    job.progress = p;
    job.listeners.forEach((l) => {
      try { l(p); } catch { /* a listener must not break the job */ }
    });
  };
  job.promise = (async () => {
    const { dir, file } = cachePathFor(url, descriptor);
    const hit = await cachedPlaintext(url, descriptor);
    if (hit) return hit;
    await ensureDir(dir);

    const local = messageId ? localPlaintext.get(messageId) : undefined;
    if (local) {
      try {
        await FileSystem.copyAsync({ from: local, to: file });
        return file;
      } catch { /* the picker's copy is gone — fetch it like anyone else */ }
    }

    return withSlot(async () => {
      const bin = `${dir}${randomName()}.part`;
      const tmp = `${dir}${randomName()}.tmp`;
      try {
        const task = FileSystem.createDownloadResumable(url, bin, {}, (p) => {
          const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : 0;
          if (total) report(Math.min(0.5, (p.totalBytesWritten / total) * 0.5));
        });
        const res = await task.downloadAsync();
        if (!res || res.status < 200 || res.status >= 300) throw new Error(`Download failed (${res?.status ?? "no response"})`);
        report(0.5);
        await decryptFile(bin, tmp, fileKeyOf(descriptor), (p) => report(0.5 + p * 0.5));
        await FileSystem.moveAsync({ from: tmp, to: file });
        report(1);
        return file;
      } catch (e) {
        await deleteQuietly(tmp);
        throw e;
      } finally {
        await deleteQuietly(bin);
      }
    });
  })();
  jobs.set(url, job);
  // Failures are not cached: the next attempt starts over.
  job.promise.then(
    () => { jobs.delete(url); },
    () => { jobs.delete(url); },
  );
  return job.promise;
}

/** Forget every decrypted attachment on this device (sign-out / account switch). */
export async function clearDecryptedMediaCache(): Promise<void> {
  localPlaintext.clear();
  await deleteQuietly(decryptedDir());
  await deleteQuietly(uploadDir());
}

/**
 * Hand an opened file to the user under its real name: the share sheet on
 * iOS, a folder of their choosing on Android (same flow as editor exports).
 * Resolves false when the user backed out.
 */
export async function shareDecryptedFile(uri: string, d: MediaDescriptor): Promise<boolean> {
  if (Platform.OS !== "android") {
    const res = await Share.share({ url: uri });
    return res.action !== Share.dismissedAction;
  }
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return false;
  const name = plaintextFileName(d);
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    name,
    d.mime || "application/octet-stream",
  );
  try {
    const size = await fileSize(uri);
    const chunk = 3 * 256 * 1024;
    for (let position = 0; position < size; position += chunk) {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length: Math.min(chunk, size - position),
      });
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
        append: position > 0,
      });
    }
    return true;
  } catch (e) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
    throw e;
  }
}
