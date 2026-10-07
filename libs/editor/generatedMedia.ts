export type GeneratedMediaKind = "image" | "video" | "audio";

const FORMATS: Record<string, { kind: GeneratedMediaKind; ext: string }> = {
  "image/png": { kind: "image", ext: "png" },
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "image/avif": { kind: "image", ext: "avif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
  "audio/webm": { kind: "audio", ext: "webm" },
  "audio/aac": { kind: "audio", ext: "aac" },
  "audio/flac": { kind: "audio", ext: "flac" },
};
const ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg", "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav", "audio/x-flac": "audio/flac", "audio/x-m4a": "audio/mp4",
};
const DEFAULTS = { image: "image/png", video: "video/mp4", audio: "audio/mpeg" };

export function assertGeneratedMediaUrl(url: string): void {
  if (!/^(https?:\/\/|blob:|data:)/i.test(url)) throw new Error("Invalid generated media URL");
}

/** Response metadata wins over a provider's URL or requested output format. */
export function generatedMediaFormat(kind: GeneratedMediaKind, url: string, contentType?: string) {
  let mime = (contentType || (/^data:([^;,]+)/i.exec(url)?.[1] ?? "")).split(";")[0].trim().toLowerCase();
  mime = ALIASES[mime] ?? mime;
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") {
    const ext = /\.([a-z0-9]+)$/i.exec(url.split(/[?#]/)[0])?.[1]?.toLowerCase();
    const normalized = ext === "jpeg" ? "jpg" : ext === "opus" || ext === "oga" ? "ogg" : ext;
    mime = Object.keys(FORMATS).find(key => FORMATS[key].kind === kind && FORMATS[key].ext === normalized) ?? DEFAULTS[kind];
  }
  const format = FORMATS[mime];
  if (!format || format.kind !== kind) throw new Error("The generated asset has an unsupported media format");
  return { mime, ext: format.ext };
}

export function generatedMediaName(kind: GeneratedMediaKind, title: string, ext: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || kind}.${ext}`;
}
