import * as FileSystem from "expo-file-system/legacy";
import { searchFreeAssets } from "./freeAssets";
import { importClipFile, importPicture, type MediaMeta, type MediaProvenance } from "./storage";
import { stockSearchPlan, type StockOrientation } from "./stockSearchPlan";
export type { StockOrientation } from "./stockSearchPlan";
export type StockKind = "photo" | "video" | "audio";

export interface StockItem {
  title: string; downloadUrl: string; mimeType: string;
  thumbnailUrl?: string;
  width?: number; height?: number; duration?: number;
  source?: string; landingUrl?: string; creator?: string; creatorUrl?: string;
  license?: string; licenseUrl?: string; attributionRequired?: boolean; attributionText?: string;
}
const NOT_A_PHOTO = /illustrat|clip ?art|vector|drawing|cartoon|icon|logo|diagram|sketch|svg/i;
export async function searchStock(query: string, orientation: StockOrientation, kind: StockKind): Promise<StockItem[]> {
  return (await searchFreeAssets({ kind, query, orientation })).items;
}
export function pickStock(items: StockItem[], kind: StockKind): StockItem | undefined {
  const usable = items.filter(a => a.downloadUrl && (kind === "photo" ? /^image\//.test(a.mimeType) && !/svg/i.test(a.mimeType) : a.mimeType.startsWith(`${kind}/`)));
  if (kind !== "photo") return usable.find(a => !a.duration || a.duration <= (kind === "video" ? 180 : 600));
  const photos = usable.filter(a => !NOT_A_PHOTO.test(a.title));
  return photos.find(a => (a.width ?? 0) >= 1000) ?? photos[0] ?? usable[0];
}
function provenance(item: StockItem): MediaProvenance {
  return { source: item.source ?? "", sourceUrl: item.landingUrl ?? "", creator: item.creator ?? "", creatorUrl: item.creatorUrl,
    license: item.license ?? "", licenseUrl: item.licenseUrl, attributionRequired: !!item.attributionRequired, attributionText: item.attributionText ?? "" };
}
function extension(item: StockItem, kind: StockKind): string {
  const mime = item.mimeType.split(";")[0].toLowerCase();
  const ext: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac" };
  return ext[mime] ?? (kind === "photo" ? "jpg" : kind === "video" ? "mp4" : "mp3");
}

/** Download only on request, keeping the source licence beside the imported media. */
export async function importStockAsset(query: string, orientation: StockOrientation = "all", kind: StockKind = "photo"): Promise<MediaMeta | null> {
  for (const [q, o] of stockSearchPlan(query, orientation)) {
    let items: StockItem[];
    try { items = await searchStock(q, o, kind); } catch { return null; }
    const item = pickStock(items, kind);
    if (!item) continue;
    const imported = await importStockItem(item, kind);
    if (imported) return imported;
  }
  return null;
}

export async function importStockItem(item: StockItem, kind: StockKind): Promise<MediaMeta | null> {
    const ext = extension(item, kind);
    const tmp = `${FileSystem.cacheDirectory ?? ""}stock-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    try {
      const dl = await FileSystem.downloadAsync(item.downloadUrl, tmp);
      if (dl.status < 200 || dl.status >= 300) return null;
      const picked = { uri: dl.uri, width: item.width ?? 1080, height: item.height ?? 1080, mimeType: item.mimeType,
        fileName: `${(item.title || "stock").slice(0, 60)}.${ext}`, duration: item.duration, provenance: provenance(item) };
      return kind === "photo" ? await importPicture(picked) : await importClipFile({ ...picked, kind });
    } catch { return null; }
    finally { await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {}); }
}
export async function importStockPhoto(query: string, orientation: StockOrientation = "all"): Promise<string | null> {
  return (await importStockAsset(query, orientation, "photo"))?.id ?? null;
}
