/**
 * Profile reel
 * ============
 * A tap on a post in a profile's grid opens that creator's posts one by one in
 * the Shorts viewer, from the tapped one: videos play, photos page sideways,
 * and everything else is a "still" slide (a text poster, a comic deck, an
 * article cover, or a lock for a paid post) drawn by ReelStillSlide.
 */
import { canOpenPostVideoViewer } from "../navigation/postVideoViewerParams";
import { isHoldGated } from "./content-gate";
import { buildFeedImageUrls } from "./misc";

export interface ReelStill {
  kind: "text" | "comic" | "article" | "locked";
  text?: string;
  title?: string;
  images?: string[];
  captions?: string[];
  alts?: string[];
  border?: string;
  cover?: string;
}

type Row = Record<string, any>;

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && !!v.trim());
  return typeof value === "string" && value.trim() ? [value] : [];
}

function imagesOf(row: Row): string[] {
  const raw = listOf(row.imageUrls).length ? listOf(row.imageUrls) : listOf(row.imageUrl);
  return buildFeedImageUrls(raw.filter((url) => /^https?:/i.test(url) || !/^[a-z][a-z\d+.-]*:/i.test(url))) || [];
}

/** Paid, held or subscriber-only, and not yet opened by this viewer. */
function isLockedFor(row: Row): boolean {
  if (row.isOwner || row.isUnlocked) return false;
  const info = row.streamInfo || {};
  if (row.is_ppv || info.isPayPerView) return true;
  if (isHoldGated(info.isLockContent, info.lockAmount ?? info.lockContentAmount)) return true;
  if (row.isLocked) return true;
  return !!row.plansDetails?.length;
}

/**
 * The still slide for a row, or null when the viewer plays it as it always
 * has (a video, or a photo post with the photo pager).
 */
export function reelStillOf(row: Row | null | undefined): ReelStill | null {
  if (!row) return null;
  const type = row.postType;
  if (type === "video" || type === "short") {
    return canOpenPostVideoViewer(row as any) ? null : { kind: "locked", cover: row.thumbnail || row.imageUrl || undefined };
  }
  if (type === "live") return null;
  if (isLockedFor(row)) return { kind: "locked", cover: undefined };
  const text = String(row.description || "").replace(/\[soundtrack:[^\]]*\]/g, "").trim();
  const title = String(row.name || row.title || "").trim();
  if (row.articleBody) {
    return {
      kind: "article",
      title: title || text.split("\n")[0],
      text: String(row.articleBody).slice(0, 600),
      cover: row.articleImageUrl ? buildFeedImageUrls([row.articleImageUrl])[0] : undefined,
    };
  }
  if (type === "feed-images") {
    const images = imagesOf(row);
    if (!images.length) return text || title ? { kind: "text", text: text || title } : null;
    if (row.layout === "comic") {
      return { kind: "comic", images, captions: listOf(row.mediaCaptions), alts: listOf(row.mediaDescriptions), border: row.comicBorder || undefined };
    }
    return null; // the photo pager
  }
  const words = text || title;
  return words ? { kind: "text", text: words } : null;
}

/** Whether a row can be a slide in the reel at all. */
export function isReelSlide(row: Row): boolean {
  if (row.postType === "live" || row.streamKey) return false;
  if (row.postType === "video" || row.postType === "short" || row.postType === "feed-images") return true;
  return !!reelStillOf(row);
}
