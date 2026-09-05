/**
 * Flattening paged feed responses into one list of rows.
 *
 * `/feed` pages by offset, so a post published while someone is scrolling
 * shifts everything down and the next page repeats what the previous one
 * already returned. Measured against production: three pages of 100 came back
 * with 306 posts and 301 distinct ids.
 *
 * The list key used to fold the page and index into itself (`-p2-i7`), which
 * made both copies of a repeated post unique and so rendered them both. A
 * reader saw the same post twice — most visibly for whoever had posted most
 * recently, because their post is the one crossing the page boundary.
 *
 * First copy wins: it holds the earlier page's position, which is where the
 * reader has already scrolled past it.
 */
export interface FeedPage {
  result?: unknown[] | null;
}

export function flattenFeedPages<T>(
  pages: FeedPage[],
  isDeleted: (id: string | number) => boolean,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  pages.forEach((res, pageNum) => {
    (res?.result || []).forEach((raw, idx) => {
      const it = raw as any;
      const id = it?.tokenId ?? it?.id;

      if (id != null) {
        const key = String(id);
        if (seen.has(key)) return;
        seen.add(key);
        if (isDeleted(id)) return;
      }

      const base = it?.tokenId || it?.id || it?.nftId || `auto`;
      const created = it?.createdAt || it?.created_at || `nocreated`;
      out.push({ ...it, __listKey: `${base}-${created}-p${pageNum}-i${idx}` } as T);
    });
  });

  return out;
}
