/**
 * Local file → Supabase Storage, the way that works on a phone.
 *
 * `fetch(localUri)` → `.blob()` → `supabase.storage.upload(blob)` is the
 * pattern this replaces. Android's photo picker hands back `content://` URIs
 * that React Native's fetch cannot open at all, and a Blob request body
 * through supabase-js is unreliable on this React Native version either way;
 * both surface to the user as "Network request failed". `uploadAsync` streams
 * the bytes from disk in native code, which is how the stage recorder has
 * always uploaded (hooks/useStages.ts).
 */
import * as FileSystem from "expo-file-system/legacy";
import env from "../config/env";
import { supabase } from "../services/supabase";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  wav: "audio/wav",
};

const EXTENSION_BY_MIME: Record<string, string> = {};
for (const [ext, mime] of Object.entries(MIME_BY_EXTENSION)) {
  if (!EXTENSION_BY_MIME[mime]) EXTENSION_BY_MIME[mime] = ext;
}

export type LocalFileHints = {
  /** `file://` path or, on Android, a picker `content://` URI. */
  uri?: string | null;
  /** The picker's original file name, when it reports one. */
  fileName?: string | null;
  /** The picker's MIME type, when it reports one. */
  mimeType?: string | null;
};

/**
 * Lower-case extension (no dot) for a local file: from the URI's path, else
 * the picker's file name, else its MIME type, else `fallback`. A `content://`
 * URI carries no extension and its last path segment is not a stand-in for
 * one, so nothing here guesses from the tail of an arbitrary string.
 */
export function fileExtension(hints: LocalFileHints, fallback: string): string {
  for (const name of [hints.uri, hints.fileName]) {
    if (!name) continue;
    const match = name.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
    if (match) return match[1].toLowerCase();
  }
  const mime = hints.mimeType?.toLowerCase().split(";")[0].trim();
  if (mime && EXTENSION_BY_MIME[mime]) return EXTENSION_BY_MIME[mime];
  return fallback;
}

/** MIME type for an extension, or `fallback` when it is not one we know. */
export function contentTypeForExtension(
  ext: string | null | undefined,
  fallback = "application/octet-stream",
): string {
  return (ext && MIME_BY_EXTENSION[ext.toLowerCase()]) || fallback;
}

/** Size in bytes of a local file, or null when the file system cannot say. */
export async function localFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : null;
  } catch {
    return null;
  }
}

export type UploadLocalFileParams = {
  bucket: string;
  /** Object key inside the bucket, e.g. `${wallet}/${Date.now()}-0.jpg`. */
  path: string;
  /** `file://` path or, on Android, a picker `content://` URI. */
  uri: string;
  /** Defaults to the type implied by `path`'s extension. */
  contentType?: string;
  /** Replace an existing object at `path`. Off unless the bucket allows UPDATE. */
  upsert?: boolean;
};

/**
 * Upload a local file straight into a bucket and return its public URL.
 * Throws a plain `Error` carrying the HTTP status and the server's message on
 * anything other than a 2xx, so callers' existing catch blocks keep working.
 */
export async function uploadLocalFileToBucket({
  bucket,
  path,
  uri,
  contentType,
  upsert = false,
}: UploadLocalFileParams): Promise<string> {
  const objectPath = path.replace(/^\/+/, "");
  const type = contentType || contentTypeForExtension(fileExtension({ uri: objectPath }, ""));

  // uploadAsync reads only file:// paths. Anything else (a content:// URI from
  // Android's picker) is copied into the cache first; copyAsync knows how to
  // read a content provider even though fetch does not.
  let source = uri;
  let scratch: string | null = null;
  if (!uri.startsWith("file://")) {
    const dir = FileSystem.cacheDirectory;
    if (!dir) throw new Error("Upload failed: no cache directory to stage the file in");
    const ext = fileExtension({ uri: objectPath }, "bin");
    scratch = `${dir}upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: scratch });
    source = scratch;
  }

  // supabase-js sends the signed-in user's token when there is one and the
  // publishable key otherwise; do the same so the bucket policies that applied
  // to the old storage.upload call apply unchanged here.
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }));
  const token = sessionData?.session?.access_token || env.SUPABASE_PUBLISHABLE_KEY;

  try {
    const result = await FileSystem.uploadAsync(
      `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`,
      source,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": type,
          "x-upsert": upsert ? "true" : "false",
        },
      },
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed (${result.status}): ${describeBody(result.body)}`);
    }
  } finally {
    if (scratch) {
      FileSystem.deleteAsync(scratch, { idempotent: true }).catch(() => {});
    }
  }

  return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
}

/** Storage answers errors as JSON; surface its message, not the envelope. */
function describeBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.message ?? parsed?.error;
    if (typeof message === "string" && message) return message;
  } catch {
    // not JSON
  }
  return body.slice(0, 200) || "empty response";
}
