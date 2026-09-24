/**
 * On-device storage for editor projects and the pictures they use.
 *
 * The web keeps both in IndexedDB; here they are plain files under the app's
 * document directory. A project file is exactly a ProjectSnapshot as JSON, and
 * clips point at pictures by `mediaId`, the same as on the web.
 *
 *   editor/projects/<projectId>.json
 *   editor/media/<mediaId>.<jpg|png>   the picture
 *   editor/media/<mediaId>.json        its MediaMeta
 */
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import type { ProjectSnapshot } from "./types";
import { mediaIds, newId, parseProject } from "./project";

export interface MediaMeta {
  id: string;
  name: string;
  kind: "image";
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
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
        .filter((f) => !inUse.has(f.slice(0, f.lastIndexOf("."))))
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

// ── exports ──

/** Write an exported data URL to a cache file and return its uri. */
export async function writeExport(dataUrl: string, format: "png" | "jpeg", title: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const safe = title.replace(/[\\/:*?"<>|\s.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "design";
  const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${safe}-${Date.now()}.${format === "png" ? "png" : "jpg"}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}
