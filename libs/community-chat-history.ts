import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

export interface CommunityMessagePosition { id: string; created_at: string }
export interface CommunityChatCursor { id: string; created_at: string }
export interface CommunityChatPage<T extends CommunityMessagePosition> {
  /** Newest first. The cursor retains database timestamp precision. */
  messages: T[];
  references: T[];
  pinned_message: T | null;
  next_cursor: CommunityChatCursor | null;
}
export type CommunityChatHistory<T extends CommunityMessagePosition> =
  InfiniteData<CommunityChatPage<T>, CommunityChatCursor | null>;

export function compareCommunityMessages(a: CommunityMessagePosition, b: CommunityMessagePosition): number {
  // Normalize UTC timestamps without Date's millisecond truncation.
  const stamp = (value: string) => value.replace('+00:00', 'Z').replace(
    /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/,
    (_match, seconds: string, fraction = '') => seconds + '.' + fraction.padEnd(6, '0') + 'Z',
  );
  const left = stamp(a.created_at);
  const right = stamp(b.created_at);
  return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function communityHistoryMessages<T extends CommunityMessagePosition>(
  data: CommunityChatHistory<T> | undefined,
): T[] {
  const byId = new Map<string, T>();
  // Newer pages win when a realtime event temporarily overlaps page boundaries.
  for (const page of data?.pages ?? []) for (const row of page.messages) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort(compareCommunityMessages);
}

export function updateCommunityChatCache<T extends CommunityMessagePosition>(
  client: QueryClient,
  key: QueryKey,
  update: (rows: T[]) => T[],
): void {
  client.setQueryData<CommunityChatHistory<T>>(key, old => {
    if (!old) return old;
    const rows = new Map<string, T>();
    for (const page of old.pages) {
      for (const row of [...page.messages, ...page.references, ...(page.pinned_message ? [page.pinned_message] : [])]) {
        if (!rows.has(row.id)) rows.set(row.id, row);
      }
    }
    const changed = update([...rows.values()].sort(compareCommunityMessages));
    const byId = new Map(changed.map(row => [row.id, row]));
    const added = changed.filter(row => !rows.has(row.id));
    const replace = (list: T[]) => list.flatMap(row => {
      const next = byId.get(row.id);
      return next ? [next] : [];
    });
    return {
      ...old,
      pages: old.pages.map((page, index) => ({
        ...page,
        messages: [...replace(page.messages), ...(index === 0 ? added : [])]
          .sort((a, b) => compareCommunityMessages(b, a)),
        references: replace(page.references),
        pinned_message: page.pinned_message ? byId.get(page.pinned_message.id) ?? null : null,
      })),
    };
  });
}
