import * as FileSystem from "expo-file-system/legacy";
import { assertGeneratedMediaUrl, generatedMediaFormat, generatedMediaName, type GeneratedMediaKind } from "./generatedMedia";
import { probeGeneratedMedia, throwIfImportAborted } from "./generatedMediaProbe";
import { importClipFile, importPicture, MAX_MEDIA_BYTES, MediaTooLargeError } from "./storage";

export interface GeneratedMediaSource { url: string; kind: GeneratedMediaKind; name?: string }

/** Copy a finished result through the same storage routines as picked media. */
export async function importGeneratedMedia(source: GeneratedMediaSource, signal?: AbortSignal) {
  assertGeneratedMediaUrl(source.url);
  if (/^blob:/i.test(source.url)) throw new Error("Browser-only media URL");
  throwIfImportAborted(signal);
  const format = generatedMediaFormat(source.kind, source.url);
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) throw new Error("Editor storage unavailable");
  let temporary = `${root}editor-generated-${Date.now()}-${Math.random().toString(36).slice(2)}.${format.ext}`;
  try {
    let contentType: string | undefined;
    if (/^data:/i.test(source.url)) {
      const data = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(source.url);
      if (!data) throw new Error("Invalid media data URL");
      contentType = data[1];
      if (data[2].length * 0.75 > MAX_MEDIA_BYTES + 2) throw new MediaTooLargeError("too large");
      await FileSystem.writeAsStringAsync(temporary, data[2], { encoding: FileSystem.EncodingType.Base64 });
    } else {
      const result = await FileSystem.downloadAsync(source.url, temporary);
      if (result.status < 200 || result.status >= 300) throw new Error("Could not download generated media");
      contentType = Object.entries(result.headers ?? {}).find(([key]) => key.toLowerCase() === "content-type")?.[1];
    }
    throwIfImportAborted(signal);
    const info = await FileSystem.getInfoAsync(temporary);
    const size = info.exists && "size" in info ? info.size : 0;
    if (size > MAX_MEDIA_BYTES) throw new MediaTooLargeError("too large");
    if (!size) throw new Error("Empty generated media");
    const actual = generatedMediaFormat(source.kind, source.url, contentType);
    if (actual.ext !== format.ext) {
      const renamed = temporary.replace(/\.[^.]+$/, `.${actual.ext}`);
      await FileSystem.moveAsync({ from: temporary, to: renamed });
      temporary = renamed;
    }
    const dimensions = await probeGeneratedMedia(temporary, source.kind, signal);
    throwIfImportAborted(signal);
    const picked = { uri: temporary, ...dimensions, mimeType: actual.mime,
      fileName: generatedMediaName(source.kind, source.name || `generated-${source.kind}-${Date.now()}`, actual.ext) };
    return source.kind === "image" ? await importPicture(picked) : await importClipFile({ ...picked, kind: source.kind });
  } finally {
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
  }
}
