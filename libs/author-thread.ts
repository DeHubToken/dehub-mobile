/**
 * The author thread, as web's selectAuthorThreadEntries decides it: the post
 * creator's own top-level comments written before anybody else commented and
 * that nobody has replied to. They show under the post as its continuation
 * and leave the comments list, so each one appears once.
 */
interface ThreadRow {
  id: number | string;
  address?: string;
  user?: { address?: string } | string | null;
  parentId?: number | null;
  replyIds?: unknown[];
  createdAt: string;
}

function rowAddress(row: ThreadRow): string | undefined {
  const userAddress = row.user && typeof row.user === "object" ? row.user.address : undefined;
  return (row.address || userAddress)?.toLowerCase();
}

export function selectAuthorThreadIds(rows: ThreadRow[], authorAddress?: string): Set<string> {
  const author = authorAddress?.toLowerCase();
  const ids = new Set<string>();
  if (!author) return ids;
  const hasChildren = new Set(rows.filter((r) => r.parentId != null).map((r) => String(r.parentId)));
  const oldestFirst = rows
    .filter((r) => Number(r.id) >= 0)
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const row of oldestFirst) {
    if (row.parentId != null) break;
    if (rowAddress(row) !== author) break;
    if (row.replyIds?.length || hasChildren.has(String(row.id))) break;
    ids.add(String(row.id));
  }
  return ids;
}
