/**
 * On-device storage for editor projects and the pictures they use.
 *
 * The web keeps both in IndexedDB; here they are plain files under the app's
 * document directory. A project file is exactly a ProjectSnapshot as JSON, and
 * clips point at pictures by `mediaId`, the same as on the web.
 *
 *   editor/projects/<projectId>.json
 *   editor/media/<mediaId>.<jpg|png>   a picture
 *   editor/media/<mediaId>.<mp4|mov|…> a video or sound, copied as picked
 *   editor/media/<mediaId>.thumb.jpg   a video's first frame, for the timeline
 *   editor/media/<mediaId>.json        its MediaMeta
 */
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { File as FsFile, Paths } from "expo-file-system";
import type { ProjectSnapshot } from "./types";
import { mediaIds, newId, parseProject } from "./project";

export interface MediaMeta {
  id: string;
  name: string;
  kind: "image" | "video" | "audio";
  mimeType: string;
  width: number;
  height: number;
  /** Seconds; videos and sounds only. */
  duration?: number;
  /** Bytes on disk; videos and sounds only. */
  size?: number;
  /** A video's first frame (file name inside editor/media), for the timeline. */
  thumb?: string;
  /** File name inside editor/media. */
  file: string;
  createdAt: number;
}

/**
 * Longest edge a picture is stored at. Big enough for a 1080×1920 page at full
 * scale with room to zoom in; a 50 MP camera original would be slow to move
 * into the canvas on every open.
 */
const MAX_EDGE = 2560;

const root = () => `${FileSystem.documentDirectory ?? ""}editor/`;
const projectsDir = () => `${root()}projects/`;
const mediaDir = () => `${root()}media/`;

async function ensureDir(dir: string) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

// ── projects ──

export async function saveProject(p: ProjectSnapshot): Promise<void> {
  await ensureDir(projectsDir());
  await FileSystem.writeAsStringAsync(`${projectsDir()}${p.id}.json`, JSON.stringify(p));
}

export async function loadProject(id: string): Promise<ProjectSnapshot | null> {
  try {
    return parseProject(await FileSystem.readAsStringAsync(`${projectsDir()}${id}.json`));
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectSnapshot[]> {
  try {
    await ensureDir(projectsDir());
    const names = (await FileSystem.readDirectoryAsync(projectsDir())).filter((n) => n.endsWith(".json"));
    const all = await Promise.all(names.map((n) => loadProject(n.slice(0, -5))));
    return all.filter((p): p is ProjectSnapshot => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Delete a design, then any picture no remaining design uses. */
export async function deleteProject(id: string): Promise<void> {
  await FileSystem.deleteAsync(`${projectsDir()}${id}.json`, { idempotent: true });
  try {
    // Read every remaining design without swallowing errors: one that fails to
    // read must stop the tidy-up, not count as "uses nothing".
    const names = (await FileSystem.readDirectoryAsync(projectsDir())).filter((n) => n.endsWith(".json"));
    const inUse = new Set<string>();
    for (const n of names) {
      const p = parseProject(await FileSystem.readAsStringAsync(`${projectsDir()}${n}`));
      if (!p) return;
      mediaIds(p).forEach((m) => inUse.add(m));
    }
    const files = await FileSystem.readDirectoryAsync(mediaDir());
    await Promise.all(
      files
        .filter((f) => !inUse.has(f.slice(0, f.indexOf("."))))
        .map((f) => FileSystem.deleteAsync(`${mediaDir()}${f}`, { idempotent: true })),
    );
  } catch { /* nothing to tidy */ }
}

// ── pictures ──

export interface PickedPicture {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
  fileName?: string | null;
}

/** Copy a picked picture into editor storage, scaled down if it is huge. */
export async function importPicture(picked: PickedPicture): Promise<MediaMeta> {
  await ensureDir(mediaDir());
  const id = newId(10);
  // PNG keeps transparency, which cut-outs and stickers rely on.
  const png = /png/i.test(picked.mimeType ?? "") || /\.png$/i.test(picked.fileName ?? picked.uri);
  const longest = Math.max(picked.width, picked.height);
  const resize = longest > MAX_EDGE
    ? [{ resize: picked.width >= picked.height ? { width: MAX_EDGE } : { height: MAX_EDGE } }]
    : [];
  const out = await ImageManipulator.manipulateAsync(picked.uri, resize, {
    compress: png ? 1 : 0.92,
    format: png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
  });
  const file = `${id}.${png ? "png" : "jpg"}`;
  await FileSystem.moveAsync({ from: out.uri, to: `${mediaDir()}${file}` });
  const meta: MediaMeta = {
    id,
    name: picked.fileName || file,
    kind: "image",
    mimeType: png ? "image/png" : "image/jpeg",
    width: out.width,
    height: out.height,
    file,
    createdAt: Date.now(),
  };
  await FileSystem.writeAsStringAsync(`${mediaDir()}${id}.json`, JSON.stringify(meta));
  return meta;
}

export async function getMedia(id: string): Promise<MediaMeta | null> {
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(`${mediaDir()}${id}.json`)) as MediaMeta;
  } catch {
    return null;
  }
}

/** The picture as a data URL, which is how it reaches the canvas. */
export async function mediaDataUrl(meta: MediaMeta): Promise<string | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(`${mediaDir()}${meta.file}`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:${meta.mimeType};base64,${b64}`;
  } catch {
    return null;
  }
}

/** Save a cut-out (PNG data URL from the canvas) as a new picture. */
export async function saveCutout(dataUrl: string, width: number, height: number, sourceName: string): Promise<MediaMeta> {
  await ensureDir(mediaDir());
  const id = newId(10);
  const file = `${id}.png`;
  await FileSystem.writeAsStringAsync(`${mediaDir()}${file}`, dataUrl.slice(dataUrl.indexOf(",") + 1), {
    encoding: FileSystem.EncodingType.Base64,
  });
  const meta: MediaMeta = {
    id,
    name: `${sourceName.replace(/.[a-z0-9]+$/i, "")}-cutout.png`,
    kind: "image",
    mimeType: "image/png",
    width,
    height,
    file,
    createdAt: Date.now(),
  };
  await FileSystem.writeAsStringAsync(`${mediaDir()}${id}.json`, JSON.stringify(meta));
  return meta;
}

// ── videos and sounds ──

/**
 * Largest video or sound the editor takes. The whole file is handed to the
 * canvas page and decoded there for export, so it has to fit in memory.
 */
export const MAX_MEDIA_BYTES = 400 * 1024 * 1024;

export interface PickedClip {
  uri: string;
  kind: "video" | "audio";
  mimeType?: string | null;
  fileName?: string | null;
  width?: number;
  height?: number;
  /** Seconds. */
  duration?: number | null;
}

function extFor(p: PickedClip): string {
  const fromName = /\.([a-z0-9]{2,4})$/i.exec(p.fileName ?? p.uri)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const mime = p.mimeType ?? "";
  if (/quicktime/.test(mime)) return "mov";
  if (/webm/.test(mime)) return "webm";
  if (/mpeg/.test(mime)) return "mp3";
  if (/aac|m4a|mp4a/.test(mime)) return "m4a";
  if (/wav/.test(mime)) return "wav";
  return p.kind === "video" ? "mp4" : "m4a";
}

function mimeFor(ext: string, kind: "video" | "audio"): string {
  const map: Record<string, string> = {
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: kind === "video" ? "video/webm" : "audio/webm",
    "3gp": "video/3gpp", mkv: "video/x-matroska",
    mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  };
  return map[ext] ?? (kind === "video" ? "video/mp4" : "audio/mpeg");
}

export class MediaTooLargeError extends Error {}

/** Copy a picked video or sound into editor storage, as it is. */
export async function importClipFile(picked: PickedClip): Promise<MediaMeta> {
  await ensureDir(mediaDir());
  const info = await FileSystem.getInfoAsync(picked.uri);
  const size = info.exists && "size" in info ? info.size : 0;
  if (size > MAX_MEDIA_BYTES) throw new MediaTooLargeError("too large");
  const id = newId(10);
  const ext = extFor(picked);
  const file = `${id}.${ext}`;
  await FileSystem.copyAsync({ from: picked.uri, to: `${mediaDir()}${file}` });
  let thumb: string | undefined;
  if (picked.kind === "video") {
    try {
      const shot = await VideoThumbnails.getThumbnailAsync(`${mediaDir()}${file}`, { time: 0, quality: 0.5 });
      const small = await ImageManipulator.manipulateAsync(shot.uri, [{ resize: { height: 120 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
      thumb = `${id}.thumb.jpg`;
      await FileSystem.moveAsync({ from: small.uri, to: `${mediaDir()}${thumb}` });
    } catch { /* the timeline shows a plain block instead */ }
  }
  const duration = picked.duration ?? 0;
  const meta: MediaMeta = {
    id,
    name: picked.fileName || file,
    kind: picked.kind,
    mimeType: mimeFor(ext, picked.kind),
    width: picked.width ?? 0,
    height: picked.height ?? 0,
    duration: duration > 0 ? duration : undefined,
    size,
    thumb,
    file,
    createdAt: Date.now(),
  };
  await FileSystem.writeAsStringAsync(`${mediaDir()}${id}.json`, JSON.stringify(meta));
  return meta;
}

/** Fill in what the canvas measured (duration, size) when the picker did not say. */
export async function updateMediaMeta(id: string, patch: Partial<Pick<MediaMeta, "duration" | "width" | "height">>): Promise<void> {
  const meta = await getMedia(id);
  if (!meta) return;
  await FileSystem.writeAsStringAsync(`${mediaDir()}${id}.json`, JSON.stringify({ ...meta, ...patch }));
}

export function mediaFileUri(meta: MediaMeta): string {
  return `${mediaDir()}${meta.file}`;
}

export function mediaThumbUri(meta: MediaMeta): string | null {
  return meta.thumb ? `${mediaDir()}${meta.thumb}` : null;
}

/** A slice of a video or sound as base64, for handing it to the canvas page in pieces. */
export async function readMediaChunk(meta: MediaMeta, position: number, length: number): Promise<string> {
  return FileSystem.readAsStringAsync(mediaFileUri(meta), {
    encoding: FileSystem.EncodingType.Base64,
    position,
    length,
  });
}

/**
 * A file the exported video is written into piece by piece, as the canvas
 * page hands it over, so the whole video never sits in memory here.
 */
export function openVideoExport(title: string, ext: string) {
  const safe = title.replace(/[\\/:*?"<>|\s.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "video";
  const file = new FsFile(Paths.cache, `${safe}-${Date.now()}.${ext}`);
  file.create({ overwrite: true });
  const handle = file.open();
  return {
    uri: file.uri,
    append(b64: string) {
      handle.writeBytes(base64ToBytes(b64));
    },
    close() {
      try { handle.close(); } catch { /* already closed */ }
    },
    discard() {
      try { handle.close(); } catch { /* already closed */ }
      try { file.delete(); } catch { /* never written */ }
    },
  };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_INDEX[clean.charCodeAt(i)];
    const b = B64_INDEX[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_INDEX[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? B64_INDEX[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < len) out[o++] = (n >> 16) & 255;
    if (o < len) out[o++] = (n >> 8) & 255;
    if (o < len) out[o++] = n & 255;
  }
  return out;
}

// ── exports ──

/** Write an exported data URL to a cache file and return its uri. */
export async function writeExport(dataUrl: string, format: "png" | "jpeg", title: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const safe = title.replace(/[\\/:*?"<>|\s.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "design";
  const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${safe}-${Date.now()}.${format === "png" ? "png" : "jpg"}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}
