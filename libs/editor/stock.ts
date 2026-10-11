import * as FileSystem from "expo-file-system/legacy";
import { searchFreeAssets, type FreeAssetKind, type FreeAssetSearch } from "./freeAssets";
import { importClipFile, importPicture, MAX_MEDIA_BYTES, type MediaMeta, type MediaProvenance } from "./storage";
import { downloadEditorFile } from './downloadEditorFile';
import { probeGeneratedMedia, throwIfImportAborted } from './generatedMediaProbe';
import { generatedMediaFormat } from './generatedMedia';
import { stockSearchPlan, type StockOrientation } from "./stockSearchPlan";
export type { StockOrientation } from "./stockSearchPlan";
export type StockKind = "photo" | "video" | "audio";
export type StockLibraryKind = FreeAssetKind;

export interface StockItem {
  title: string; downloadUrl: string; mimeType: string;
  thumbnailUrl?: string;
  width?: number; height?: number; duration?: number;
  source?: string; landingUrl?: string; creator?: string; creatorUrl?: string;
  license?: string; licenseUrl?: string; attributionRequired?: boolean; attributionText?: string;
}
const NOT_A_PHOTO = /illustrat|clip ?art|vector|drawing|cartoon|icon|logo|diagram|sketch|svg/i;
function stockMimeType(mime: string, kind: StockKind): string {
  const type = mime.split(';')[0].trim().toLowerCase();
  return kind === 'audio' && type === 'application/ogg' ? 'audio/ogg' : type;
}
export async function searchStock(query: string, orientation: StockOrientation, kind: StockKind): Promise<StockItem[]> {
  return (await searchFreeAssets({ kind, query, orientation })).items;
}
export function searchStockPage(query: string, orientation: StockOrientation, kind: StockLibraryKind, page = 1, signal?: AbortSignal): Promise<FreeAssetSearch> {
  return searchFreeAssets({ kind, query, orientation, page, signal });
}
export function pickStock(items: StockItem[], kind: StockKind): StockItem | undefined {
  const usable = items.filter(a => a.downloadUrl && (kind === "photo" ? /^image\//.test(stockMimeType(a.mimeType, kind)) && !/svg/i.test(a.mimeType) : stockMimeType(a.mimeType, kind).startsWith(`${kind}/`)));
  if (kind !== "photo") return usable.find(a => !a.duration || a.duration <= (kind === "video" ? 180 : 600));
  const photos = usable.filter(a => !NOT_A_PHOTO.test(a.title));
  return photos.find(a => (a.width ?? 0) >= 1000) ?? photos[0] ?? usable[0];
}
function provenance(item: StockItem): MediaProvenance {
  return { source: item.source ?? "", sourceUrl: item.landingUrl ?? "", creator: item.creator ?? "", creatorUrl: item.creatorUrl,
    license: item.license ?? "", licenseUrl: item.licenseUrl, attributionRequired: !!item.attributionRequired, attributionText: item.attributionText ?? "" };
}
function extension(item: StockItem, kind: StockKind): string {
  const mime = stockMimeType(item.mimeType, kind);
  const ext: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac" };
  return ext[mime] ?? (kind === "photo" ? "jpg" : kind === "video" ? "mp4" : "mp3");
}

/** Download only on request, keeping the source licence beside the imported media. */
export async function importStockAsset(query: string, orientation: StockOrientation = "all", kind: StockKind = "photo", signal?: AbortSignal): Promise<MediaMeta | null> {
  for (const [q, o] of stockSearchPlan(query, orientation)) {
    if (signal?.aborted) return null;
    let items: StockItem[];
    try { items = await searchStock(q, o, kind); } catch { return null; }
    const item = pickStock(items, kind);
    if (!item) continue;
    const imported = await importStockItem(item, kind, signal);
    if (imported) return imported;
  }
  return null;
}

export async function importStockItem(item: StockItem, kind: StockKind, signal?: AbortSignal): Promise<MediaMeta | null> {
    const ext = extension(item, kind);
    const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!root || !/^https?:\/\//i.test(item.downloadUrl) || signal?.aborted) return null;
    let tmp = `${root}stock-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    try {
      const dl = await downloadEditorFile(item.downloadUrl, tmp, signal);
      if (dl.status < 200 || dl.status >= 300) return null;
      const info = await FileSystem.getInfoAsync(tmp);
      if (!info.exists || !("size" in info) || !info.size || info.size > MAX_MEDIA_BYTES) return null;
      throwIfImportAborted(signal);
      const reportedType = Object.entries(dl.headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
      const mimeType = stockMimeType(reportedType && !/^(application|binary)\/octet-stream/i.test(reportedType) ? reportedType : item.mimeType, kind);
      if (!mimeType.startsWith(kind === 'photo' ? 'image/' : `${kind}/`)) return null;
      const actual = kind === 'photo' ? { mime: mimeType, ext: extension({ ...item, mimeType }, kind) } : generatedMediaFormat(kind, item.downloadUrl, mimeType);
      if (actual.ext !== ext) {
        const renamed = tmp.replace(/\.[^.]+$/, `.${actual.ext}`);
        await FileSystem.moveAsync({ from: tmp, to: renamed }); tmp = renamed;
      }
      const dimensions = kind === 'photo' ? { width: item.width ?? 1080, height: item.height ?? 1080 } : await probeGeneratedMedia(tmp, kind, signal);
      throwIfImportAborted(signal);
      const picked = { uri: tmp, ...dimensions, mimeType: actual.mime,
        fileName: `${(item.title || "stock").slice(0, 60)}.${actual.ext}`, provenance: provenance(item) };
      return kind === "photo" ? await importPicture(picked) : await importClipFile({ ...picked, kind });
    } catch { return null; }
    finally { await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {}); }
}
export function importStockLibraryItem(item: StockItem, kind: StockLibraryKind, signal?: AbortSignal): Promise<MediaMeta | null> {
  const mediaKind = kind === "animation" ? "video" : kind === "gif" || kind === "graphic" ? "photo" : kind;
  if (!stockMimeType(item.mimeType, mediaKind).startsWith(mediaKind === "photo" ? "image/" : `${mediaKind}/`)) return Promise.resolve(null);
  return importStockItem(item, mediaKind, signal);
}
export async function importStockPhoto(query: string, orientation: StockOrientation = "all"): Promise<string | null> {
  return (await importStockAsset(query, orientation, "photo"))?.id ?? null;
}
