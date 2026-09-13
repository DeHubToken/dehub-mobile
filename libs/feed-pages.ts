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

/**
 * Row wrappers, keyed on the raw row they wrap. The list runs every row through
 * here again whenever any cached page changes (the live-count poll patches a
 * handful of rows every ten seconds), and a fresh `{ ...it }` per row handed
 * every mounted card a new `item` — so all of them re-rendered, players and
 * caption regexes included, for a count change on one. A raw row that has not
 * changed keeps the wrapper it already had, and memo'd cards bail out.
 */
const wrappers = new WeakMap<object, { key: string; row: unknown }>();

export function flattenFeedPages<T>(
  pages: FeedPage[],
  isDeleted: (id: string | number) => boolean,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  pages.forEach((res, pageNum) => {
    (res?.result || []).forEach((raw, idx) => {
      const it = raw as any;
      // Live rows carry no tokenId; the stream id is what repeats across pages.
      const id = it?.tokenId ?? it?.id ?? it?.stream?.tokenId ?? it?.streamKey ?? it?.stream?.id;

      if (id != null) {
        const key = String(id);
        if (seen.has(key)) return;
        seen.add(key);
        if (isDeleted(id)) return;
      }

      const base =
        it?.tokenId ||
        it?.id ||
        it?.nftId ||
        it?.streamKey ||
        it?.stream?.id ||
        it?.stream?.streamKey ||
        `auto`;
      const created = it?.createdAt || it?.stream?.createdAt || it?.created_at || `nocreated`;
      const listKey = `${base}-${created}-p${pageNum}-i${idx}`;
      if (it && typeof it === "object") {
        const cached = wrappers.get(it);
        if (cached && cached.key === listKey) {
          out.push(cached.row as T);
          return;
        }
        const row = { ...it, __listKey: listKey };
        wrappers.set(it, { key: listKey, row });
        out.push(row as T);
        return;
      }
      out.push({ ...it, __listKey: listKey } as T);
    });
  });

  return out;
}
