import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  communityHistoryMessages,
  type CommunityMessagePosition, type CommunityChatCursor, type CommunityChatPage,
} from '../libs/community-chat-history';

interface HistoryOptions<T extends CommunityMessagePosition> {
  communityId: string | undefined;
  walletAddress: string | null;
  enabled?: boolean;
  isPrivate: boolean;
  readPage: (args: {
    communityId: string; walletAddress: string | null;
    cursor: CommunityChatCursor | null; anchorId: string | null; signal: AbortSignal;
  }) => Promise<CommunityChatPage<T>>;
}

export function useCommunityChatHistory<T extends CommunityMessagePosition>(options: HistoryOptions<T>) {
  const { communityId, walletAddress, isPrivate, readPage, enabled = true } = options;
  const queryClient = useQueryClient();
  const scope = JSON.stringify([communityId, walletAddress?.toLowerCase() ?? null]);
  const [window, setWindow] = useState<{ scope: string; anchor: string | null } | null>(null);
  const anchor = window?.scope === scope ? window.anchor : null;
  const makeOptions = useCallback((anchorId: string | null) => ({
    queryKey: ['community-chat-messages', communityId, walletAddress?.toLowerCase() ?? null, 'v1', anchorId] as const,
    initialPageParam: null as CommunityChatCursor | null,
    queryFn: async ({ pageParam, signal }: { pageParam: CommunityChatCursor | null; signal: AbortSignal }) =>
      readPage({ communityId: communityId!, walletAddress, cursor: pageParam, anchorId: pageParam ? null : anchorId, signal }),
    getNextPageParam: (last: CommunityChatPage<T>) => last.next_cursor,
    staleTime: 30_000,
    retry: (count: number, error: { code?: string }) =>
      !['42501', 'P0002', '22023'].includes(error.code ?? '') && count < 2,
  }), [communityId, walletAddress, readPage]);
  const query = useInfiniteQuery({
    ...makeOptions(anchor),
    enabled: enabled && !!communityId,
    refetchInterval: isPrivate ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const messagesKey = useMemo(() => makeOptions(anchor).queryKey, [makeOptions, anchor]);
  const accessDenied = (query.error as { code?: string } | null)?.code === '42501';
  const rawMessages = useMemo(
    () => accessDenied ? [] : communityHistoryMessages(query.data),
    [query.data, accessDenied],
  );
  const referenceMessages = useMemo(
    () => accessDenied ? [] : (query.data?.pages ?? []).flatMap(page => page.references),
    [query.data, accessDenied],
  );
  const pinned = accessDenied ? null : query.data?.pages[0]?.pinned_message ?? null;
  const loadOlder = useCallback(async () => {
    if (!query.hasNextPage || query.isFetching) return false;
    const result = await query.fetchNextPage({ cancelRefetch: false });
    if (result.isError) throw result.error;
    return true;
  }, [query.hasNextPage, query.isFetching, query.fetchNextPage]);
  const showMessage = useCallback(async (id: string) => {
    if (rawMessages.some(row => row.id === id)) return;
    await queryClient.fetchInfiniteQuery(makeOptions(id));
    setWindow({ scope, anchor: id });
  }, [rawMessages, queryClient, makeOptions, scope]);
  const showLatest = useCallback(async () => {
    if (anchor) {
      await queryClient.fetchInfiniteQuery({ ...makeOptions(null), staleTime: 0 });
      setWindow({ scope, anchor: null });
    }
  }, [anchor, queryClient, makeOptions, scope]);
  return {
    rawMessages, referenceMessages, pinned, messagesKey,
    isLoading: query.isLoading,
    refreshHistory: query.refetch,
    error: query.error,
    hasOlderMessages: !!query.hasNextPage && !accessDenied,
    isLoadingOlder: query.isFetchingNextPage,
    loadOlder, showMessage, showLatest, isHistoryWindow: !!anchor,
  };
}
