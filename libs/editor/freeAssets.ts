import env from "../../config/env";
import type { MediaProvenance } from "./storage";

export type FreeAssetKind = "photo" | "video" | "animation" | "graphic" | "gif" | "audio";
export type FreeAssetOrientation = "all" | "landscape" | "portrait" | "square";

export interface FreeAsset {
  id: string;
  source: "Openverse" | "Wikimedia Commons" | "Pexels" | "Pixabay";
  kind: FreeAssetKind;
  title: string;
  creator: string;
  creatorUrl?: string;
  thumbnailUrl: string;
  previewUrl?: string;
  downloadUrl: string;
  landingUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  license: string;
  licenseUrl?: string;
  attributionRequired: boolean;
  attributionText: string;
}

export interface FreeAssetSearch {
  items: FreeAsset[];
  page: number;
  hasMore: boolean;
  total?: number;
  providers: string[];
}

export interface SearchFreeAssetsOptions {
  kind: FreeAssetKind;
  query: string;
  page?: number;
  orientation?: FreeAssetOrientation;
  signal?: AbortSignal;
}

// Openverse anonymous access caps page_size at 20. Keeping the federated page
// at that size preserves the zero-key fallback used before the Edge Function
// is deployed or whenever it is temporarily unavailable.
const PAGE_SIZE = 20;
let functionRetryAfter = 0;
const FALLBACK_QUERIES: Record<FreeAssetKind, string> = {
  photo: "nature",
  video: "ocean",
  animation: "abstract",
  graphic: "illustration",
  gif: "funny",
  audio: "whoosh",
};

function functionUrl(): string | null {
  const root = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  return root ? `${root}/functions/v1/free-stock-assets` : null;
}

function functionHeaders(): HeadersInit {
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || "");
  return key ? { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function plainText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromFile(value: string): string {
  return value.replace(/^File:/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").trim();
}

function orientationMatches(asset: Pick<FreeAsset, "width" | "height">, orientation: FreeAssetOrientation): boolean {
  if (orientation === "all" || !asset.width || !asset.height) return true;
  const ratio = asset.width / asset.height;
  if (orientation === "square") return ratio >= 0.86 && ratio <= 1.14;
  return orientation === "landscape" ? ratio > 1.14 : ratio < 0.86;
}

function normaliseResult(value: unknown): FreeAssetSearch | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<FreeAssetSearch>;
  if (!Array.isArray(result.items)) return null;
  return {
    items: result.items,
    page: Number(result.page) || 1,
    hasMore: Boolean(result.hasMore),
    total: Number.isFinite(result.total) ? result.total : undefined,
    providers: Array.isArray(result.providers) ? result.providers : [],
  };
}

async function searchViaFunction(options: SearchFreeAssetsOptions): Promise<FreeAssetSearch | null> {
  const url = functionUrl();
  if (!url) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: functionHeaders(),
    body: JSON.stringify({
      kind: options.kind,
      query: options.query || FALLBACK_QUERIES[options.kind],
      page: options.page || 1,
      orientation: options.orientation || "all",
    }),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`Asset service returned ${response.status}`);
  return normaliseResult(await response.json());
}

async function searchOpenverse(options: SearchFreeAssetsOptions): Promise<FreeAssetSearch> {
  const page = options.page || 1;
  const query = options.query || FALLBACK_QUERIES[options.kind];
  const endpoint = options.kind === "audio" ? "audio" : "images";
  const url = new URL(`https://api.openverse.org/v1/${endpoint}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("license", "cc0,pdm,by,by-sa");
  url.searchParams.set("mature", "false");
  if (options.kind === "photo") url.searchParams.set("categories", "photograph");
  if (options.kind === "graphic") url.searchParams.set("categories", "illustration,digitized_art");
  // Ask Openverse for the shape; filtering one page afterwards often left nothing.
  const aspect = ({ square: "square", landscape: "wide", portrait: "tall" } as const)[options.orientation as "square" | "landscape" | "portrait"];
  if (aspect && options.kind !== "audio") url.searchParams.set("aspect_ratio", aspect);
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Openverse returned ${response.status}`);
  const data = await response.json() as { results?: Array<Record<string, unknown>>; page_count?: number; result_count?: number };
  const items = (data.results || []).flatMap((row): FreeAsset[] => {
    const downloadUrl = String(row.url || "");
    const landingUrl = String(row.foreign_landing_url || row.detail_url || "");
    if (!downloadUrl || !landingUrl) return [];
    const licenseCode = String(row.license || "").toUpperCase();
    const version = String(row.license_version || "");
    const license = licenseCode === "PDM" ? "Public domain" : `${licenseCode}${version ? ` ${version}` : ""}`;
    const creator = plainText(row.creator) || "Unknown creator";
    const kind = options.kind;
    const asset: FreeAsset = {
      id: `openverse:${String(row.id)}`,
      source: "Openverse",
      kind,
      title: plainText(row.title) || "Untitled",
      creator,
      creatorUrl: String(row.creator_url || "") || undefined,
      thumbnailUrl: String(row.thumbnail || (kind === "audio" ? "" : downloadUrl)),
      previewUrl: kind === "audio" ? downloadUrl : undefined,
      downloadUrl,
      landingUrl,
      mimeType: String(row.mime_type || (kind === "audio" ? "audio/mpeg" : "image/jpeg")),
      width: Number(row.width) || undefined,
      height: Number(row.height) || undefined,
      duration: kind === "audio" && Number(row.duration) ? Number(row.duration) / 1000 : undefined,
      license,
      licenseUrl: String(row.license_url || "") || undefined,
      attributionRequired: !["CC0", "PDM"].includes(licenseCode),
      attributionText: `${plainText(row.title) || "Untitled"} by ${creator}, ${license}, via Openverse`,
    };
    return orientationMatches(asset, options.orientation || "all") ? [asset] : [];
  });
  return {
    items,
    page,
    hasMore: page < Number(data.page_count || page),
    total: Number(data.result_count) || undefined,
    providers: ["Openverse"],
  };
}

async function searchWikimedia(options: SearchFreeAssetsOptions): Promise<FreeAssetSearch> {
  const page = options.page || 1;
  const query = options.query || FALLBACK_QUERIES[options.kind];
  const fileFilter = options.kind === "gif" ? "filemime:image/gif" : `filetype:${options.kind === "animation" ? "video" : options.kind}`;
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${options.kind === "animation" ? "animation " : ""}${query} ${fileFilter}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(PAGE_SIZE));
  url.searchParams.set("gsroffset", String((page - 1) * PAGE_SIZE));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "480");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Wikimedia Commons returned ${response.status}`);
  const data = await response.json() as { continue?: unknown; query?: { pages?: Array<Record<string, unknown>> } };
  const pages = data.query?.pages || [];
  const items = pages.flatMap((pageRow): FreeAsset[] => {
    const info = (pageRow.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    if (!info) return [];
    const meta = (info.extmetadata || {}) as Record<string, { value?: unknown }>;
    const downloadUrl = String(info.url || "");
    const landingUrl = String(info.descriptionurl || "");
    if (!downloadUrl || !landingUrl) return [];
    const size = Number(info.size) || 0;
    const duration = Number(info.duration) || 0;
    const mimeType = String(info.mime || "");
    if ((options.kind === "video" || options.kind === "animation") && (mimeType !== "video/webm" || duration > 180 || size > 250 * 1024 * 1024)) return [];
    if (options.kind === "gif" && size > 50 * 1024 * 1024) return [];
    if (options.kind === "audio" && duration > 600) return [];
    const title = plainText(meta.ObjectName?.value) || titleFromFile(String(pageRow.title || "Untitled"));
    const creator = plainText(meta.Artist?.value) || "Wikimedia Commons contributor";
    const license = plainText(meta.LicenseShortName?.value) || plainText(meta.UsageTerms?.value) || "Free licence";
    const asset: FreeAsset = {
      id: `wikimedia:${String(pageRow.pageid)}`,
      source: "Wikimedia Commons",
      kind: options.kind,
      title,
      creator,
      thumbnailUrl: String(info.thumburl || (options.kind === "audio" ? "" : downloadUrl)),
      previewUrl: options.kind === "audio" ? downloadUrl : undefined,
      downloadUrl,
      landingUrl,
      mimeType: mimeType || (options.kind === "audio" ? "audio/ogg" : options.kind === "video" || options.kind === "animation" ? "video/webm" : "image/gif"),
      width: Number(info.width) || undefined,
      height: Number(info.height) || undefined,
      duration: duration || undefined,
      license,
      licenseUrl: plainText(meta.LicenseUrl?.value) || undefined,
      attributionRequired: String(meta.AttributionRequired?.value).toLowerCase() === "true",
      attributionText: `${title} by ${creator}, ${license}, via Wikimedia Commons`,
    };
    return orientationMatches(asset, options.orientation || "all") ? [asset] : [];
  });
  return { items, page, hasMore: Boolean(data.continue), providers: ["Wikimedia Commons"] };
}

async function searchDirect(options: SearchFreeAssetsOptions): Promise<FreeAssetSearch> {
  if (options.kind === "photo" || options.kind === "graphic") return searchOpenverse(options);
  if (options.kind === "audio") {
    const [openverse, commons] = await Promise.allSettled([searchOpenverse(options), searchWikimedia(options)]);
    const searches = [openverse, commons].flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!searches.length) throw new Error("Free audio providers are unavailable");
    return {
      items: searches.flatMap((result) => result.items),
      page: options.page || 1,
      hasMore: searches.some((result) => result.hasMore),
      total: searches.reduce((sum, result) => sum + (result.total || 0), 0) || undefined,
      providers: searches.flatMap((result) => result.providers),
    };
  }
  return searchWikimedia(options);
}

export async function searchFreeAssets(options: SearchFreeAssetsOptions): Promise<FreeAssetSearch> {
  if (Date.now() >= functionRetryAfter) {
    try {
      const edgeAttempt = searchViaFunction(options);
      const result = await Promise.race([
        edgeAttempt,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (result) return result;
      functionRetryAfter = Date.now() + 60_000;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      functionRetryAfter = Date.now() + 60_000;
      console.warn("[editor] stock asset service unavailable, using open providers", error);
    }
  }
  return searchDirect(options);
}

export function provenanceForAsset(asset: FreeAsset): MediaProvenance {
  return {
    source: asset.source,
    sourceUrl: asset.landingUrl,
    creator: asset.creator,
    creatorUrl: asset.creatorUrl,
    license: asset.license,
    licenseUrl: asset.licenseUrl,
    attributionRequired: asset.attributionRequired,
    attributionText: asset.attributionText,
  };
}
