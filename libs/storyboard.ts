/**
 * Seek-preview storyboards
 * ========================
 * One JPEG sprite sheet per video, made server-side by a transcode runner: a
 * grid of small frames, one every `spriteDuration` seconds. Sprite `i` covers
 * [i * spriteDuration, (i + 1) * spriteDuration) and sits at column
 * `i % columns`, row `floor(i / columns)`, each `spriteWidth` x `spriteHeight`.
 */
import env from "../config/env";

export interface Storyboard {
  /** Absolute URL of the sheet. */
  url: string;
  spriteWidth: number;
  spriteHeight: number;
  spriteCount: number;
  spriteDuration: number;
  columns: number;
}

const FALLBACK_CDN = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com";

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (env.CDN_BASE_URL || FALLBACK_CDN).replace(/\/+$/, "");
  return `${base}/${url.replace(/^\/+/, "")}`;
}

/**
 * The post's storyboard as the player uses it, or undefined when there is
 * none to show. Paid posts' sheets are private and are skipped: the CDN would
 * refuse them.
 */
export function toStoryboard(raw: unknown): Storyboard | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const sb = raw as Record<string, unknown>;
  if (sb.private) return undefined;
  const url = typeof sb.url === "string" && sb.url ? absolute(sb.url) : undefined;
  const spriteWidth = positive(sb.spriteWidth);
  const spriteHeight = positive(sb.spriteHeight);
  const spriteCount = positive(sb.spriteCount);
  const spriteDuration = positive(sb.spriteDuration);
  const columns = positive(sb.columns);
  if (!url || !spriteWidth || !spriteHeight || !spriteCount || !spriteDuration || !columns) return undefined;
  return { url, spriteWidth, spriteHeight, spriteCount, spriteDuration, columns };
}

/** Pixel offset of the sprite for a moment in the video. */
export function storyboardOffset(sb: Storyboard, seconds: number): { x: number; y: number } {
  const t = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const index = Math.min(sb.spriteCount - 1, Math.floor(t / sb.spriteDuration));
  return {
    x: (index % sb.columns) * sb.spriteWidth,
    y: Math.floor(index / sb.columns) * sb.spriteHeight,
  };
}

/** Full size of the sheet, for laying the image out behind the window. */
export function storyboardSheetSize(sb: Storyboard): { width: number; height: number } {
  return {
    width: sb.columns * sb.spriteWidth,
    height: Math.ceil(sb.spriteCount / sb.columns) * sb.spriteHeight,
  };
}
