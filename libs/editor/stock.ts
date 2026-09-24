/**
 * Free stock photos for the AI agent and templates, downloaded into editor
 * storage on the phone. Same source and rules as the web
 * (dehubweb src/lib/editor/freeAssets.ts and agent.ts pickStock): the
 * `free-stock-assets` edge function first, Openverse directly if it is down,
 * the shape asked of Openverse itself (aspect_ratio), and clip-art skipped.
 */
import * as FileSystem from "expo-file-system/legacy";
import env from "../../config/env";
import { importPicture } from "./storage";

export type StockOrientation = "all" | "landscape" | "portrait" | "square";

interface StockItem {
  title: string;
  downloadUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
}

const NOT_A_PHOTO = /illustrat|clip ?art|vector|drawing|cartoon|icon|logo|diagram|sketch|svg/i;
const OPENVERSE_ASPECT: Partial<Record<StockOrientation, string>> = { square: "square", landscape: "wide", portrait: "tall" };

async function viaFunction(query: string, orientation: StockOrientation): Promise<StockItem[]> {
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/free-stock-assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ kind: "photo", query, page: 1, orientation }),
  });
  if (!res.ok) throw new Error(`stock ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

async function viaOpenverse(query: string, orientation: StockOrientation): Promise<StockItem[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "20");
  url.searchParams.set("license", "cc0,pdm,by,by-sa");
  url.searchParams.set("mature", "false");
  url.searchParams.set("categories", "photograph");
  const aspect = OPENVERSE_ASPECT[orientation];
  if (aspect) url.searchParams.set("aspect_ratio", aspect);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`openverse ${res.status}`);
  const data = await res.json();
  return (data?.results ?? []).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    downloadUrl: String(r.url ?? ""),
    mimeType: String(r.mime_type ?? "image/jpeg"),
    width: Number(r.width) || undefined,
    height: Number(r.height) || undefined,
  }));
}

async function search(query: string, orientation: StockOrientation): Promise<StockItem[]> {
  try {
    return await viaFunction(query, orientation);
  } catch {
    try {
      return await viaOpenverse(query, orientation);
    } catch {
      return [];
    }
  }
}

function pick(items: StockItem[]): StockItem | undefined {
  const photos = items.filter((a) => a.downloadUrl && !NOT_A_PHOTO.test(a.title) && !a.mimeType.includes("svg"));
  return photos.find((a) => (a.width ?? 0) >= 1000) ?? photos[0] ?? items.find((a) => a.downloadUrl);
}

/**
 * Find and import a stock photo; resolves with its media id, or null when
 * nothing matched. Loosens the search before giving up, like the web agent.
 */
export async function importStockPhoto(query: string, orientation: StockOrientation = "all"): Promise<string | null> {
  const short = query.split(/\s+/).slice(0, 2).join(" ");
  const attempts: [string, StockOrientation][] = [[query, orientation], [query, "all"], [short, "all"]];
  for (const [q, o] of attempts) {
    const item = pick(await search(q, o));
    if (!item) continue;
    try {
      const ext = /png/i.test(item.mimeType) ? "png" : "jpg";
      const tmp = `${FileSystem.cacheDirectory ?? ""}stock-${Date.now()}.${ext}`;
      const dl = await FileSystem.downloadAsync(item.downloadUrl, tmp);
      if (dl.status < 200 || dl.status >= 300) continue;
      const meta = await importPicture({
        uri: dl.uri,
        width: item.width ?? 1080,
        height: item.height ?? 1080,
        mimeType: item.mimeType,
        fileName: `${(item.title || "stock").slice(0, 60)}.${ext}`,
      });
      await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      return meta.id;
    } catch {
      /* try the next attempt */
    }
  }
  return null;
}
