/**
 * How the owner's articles look as tiles in their profile grid.
 *
 * Stored as `customs.articleTile` on the account, like the text-post backdrop
 * (customs.postBg). Only these ids render; anything else falls back to the
 * cover look. The same list lives in dehubweb (src/lib/article-tile.ts).
 */
export const ARTICLE_TILE_CUSTOMS_KEY = "articleTile";

export type ArticleTileLook = "cover" | "dropcap";

export function parseArticleTile(customs: Record<string, unknown> | null | undefined): ArticleTileLook {
  return customs?.[ARTICLE_TILE_CUSTOMS_KEY] === "dropcap" ? "dropcap" : "cover";
}

/** customs with the look set, every other key kept. */
export function mergeArticleTile(customs: Record<string, unknown> | null | undefined, look: ArticleTileLook): Record<string, unknown> {
  return { ...(customs ?? {}), [ARTICLE_TILE_CUSTOMS_KEY]: look };
}

/** Reading time the article tiles show, at 230 words a minute. */
export function articleReadMinutes(body: string | undefined): number {
  const words = (body || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}
