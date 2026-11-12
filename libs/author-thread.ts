/**
 * The author thread, as web's selectAuthorThreadEntries decides it: every
 * straight comment the post creator left on their own post (not a reply),
 * in the author's order (byThreadOrder), read like an X thread. Under the
 * post, the block takes the leading run up to the first entry somebody replied to; the rest lead the
 * comments list in the same order, so the thread reads in posting order and
 * each comment appears once.
 */
interface ThreadRow {
  id: number | string;
  address?: string;
  user?: { address?: string } | string | null;
  parentId?: number | null;
  replyIds?: unknown[];
  createdAt: string;
  /** Where the author placed this part with Reorder; absent when never placed. */
  threadPos?: number | null;
}

function rowAddress(row: ThreadRow): string | undefined {
  const userAddress = row.user && typeof row.user === "object" ? row.user.address : undefined;
  return (row.address || userAddress)?.toLowerCase();
}

/** A straight comment by the post's author: not a reply to anybody. */
export function isAuthorThreadRoot(row: ThreadRow, authorAddress?: string | null): boolean {
  const author = authorAddress?.toLowerCase();
  return !!author && row.parentId == null && rowAddress(row) === author;
}

/**
 * Reading order of the author's thread: parts the author placed (Reorder,
 * `threadPos`) by that place, ahead of every part never placed; those oldest
 * first. The API and web (compareThreadParts) sort the same way.
 */
export function byThreadOrder(a: Pick<ThreadRow, "createdAt" | "threadPos">, b: Pick<ThreadRow, "createdAt" | "threadPos">): number {
  const aPlaced = typeof a.threadPos === "number";
  const bPlaced = typeof b.threadPos === "number";
  if (aPlaced && bPlaced) return (a.threadPos as number) - (b.threadPos as number);
  if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/**
 * Roots in list order: the author's straight comments first, oldest first,
 * then every other root in the order it came. Stable, so the server's order
 * (pins, anchors, tips) holds under the author's thread.
 */
export function authorThreadFirst<T extends ThreadRow>(roots: T[], authorAddress?: string | null): T[] {
  const authored = roots.filter((r) => isAuthorThreadRoot(r, authorAddress)).sort(byThreadOrder);
  if (!authored.length) return roots;
  return [...authored, ...roots.filter((r) => !isAuthorThreadRoot(r, authorAddress))];
}

export function selectAuthorThreadIds(rows: ThreadRow[], authorAddress?: string): Set<string> {
  const ids = new Set<string>();
  if (!authorAddress) return ids;
  const hasChildren = new Set(rows.filter((r) => r.parentId != null).map((r) => String(r.parentId)));
  const oldestFirst = rows
    .filter((r) => Number(r.id) >= 0 && isAuthorThreadRoot(r, authorAddress))
    .sort(byThreadOrder);
  for (const row of oldestFirst) {
    if (row.replyIds?.length || hasChildren.has(String(row.id))) break;
    ids.add(String(row.id));
  }
  return ids;
}
