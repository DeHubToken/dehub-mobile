/**
 * Which replies a collapsed comment thread shows.
 *
 * Normally the first `count`. When the post's creator has answered somewhere
 * in the thread, their first answer instead, with the replies it hangs from so
 * it never reads as addressed to nobody.
 *
 * The API lifts threads the creator replied in to the top of the list. Showing
 * somebody else's reply under a lifted thread left it at the top with no
 * visible reason for being there; the creator's answer is the reason.
 */

interface PreviewRow {
  id: number | string;
  parentId?: number | string | null;
  address?: string;
  user?: { address?: string } | null;
}

const authorOf = (row: PreviewRow) => (row.user?.address ?? row.address)?.toLowerCase();

/**
 * @param rows every loaded row, in reading order
 * @param rootOf the root id a reply belongs to; undefined for a top-level row
 * @returns root id → the reply ids that root shows while collapsed
 */
export function collapsedReplyIds<R extends PreviewRow>(
  rows: R[],
  rootOf: (row: R) => string | undefined,
  creatorAddress: string | null | undefined,
  count: number,
): Map<string, Set<string>> {
  const creator = creatorAddress?.toLowerCase();
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const repliesByRoot = new Map<string, R[]>();
  for (const row of rows) {
    const root = rootOf(row);
    if (root == null) continue;
    const replies = repliesByRoot.get(root);
    if (replies) replies.push(row);
    else repliesByRoot.set(root, [row]);
  }

  const shown = new Map<string, Set<string>>();
  repliesByRoot.forEach((replies, root) => {
    const answer = creator ? replies.find((row) => authorOf(row) === creator) : undefined;
    if (!answer) {
      shown.set(root, new Set(replies.slice(0, count).map((row) => String(row.id))));
      return;
    }
    const path = new Set<string>();
    for (
      let current: R | undefined = answer;
      current && String(current.id) !== root && !path.has(String(current.id));
      current = current.parentId != null ? byId.get(String(current.parentId)) : undefined
    ) {
      path.add(String(current.id));
    }
    shown.set(root, path);
  });
  return shown;
}
