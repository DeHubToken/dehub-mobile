import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCommunityChatHistory } from '../../hooks/useCommunityChatHistory';
import type { CommunityChatPage } from '../../libs/community-chat-history';
type Row = { id: string; created_at: string };
const row = (id: string): Row => ({ id, created_at: '2026-10-01T12:00:00.123456Z' });
const page = (id: string, next: string | null = null): CommunityChatPage<Row> => ({
 messages: [row(id)], references: [], pinned_message: null, next_cursor: next ? row(next) : null,
});
function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
 const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider,{ client },children);
 return { client, wrapper };
}
test('loads older pages and moves between an old pin and the current conversation', async () => {
 const { client, wrapper } = setup();
 const requests: Array<string | null> = [];
 const readPage = async ({ cursor, anchorId }: { cursor: Row | null; anchorId: string | null }) => {
  requests.push(cursor?.id ?? anchorId);
  return anchorId ? page(anchorId) : cursor ? page('a') : page('c','b');
 };
 const { result, unmount } = renderHook(()=>useCommunityChatHistory({communityId:'group',walletAddress:'wallet',isPrivate:false,readPage}),{wrapper});
 await waitFor(()=>expect(result.current.rawMessages.map(m=>m.id)).toEqual(['c']));
 await act(async()=>{ await result.current.loadOlder(); });
 await waitFor(()=>expect(result.current.rawMessages.map(m=>m.id)).toEqual(['a','c']));
 await act(async()=>{ await result.current.showMessage('old-pin'); });
 await waitFor(()=>expect(result.current.isHistoryWindow).toBe(true));
 expect(result.current.rawMessages.map(m=>m.id)).toEqual(['old-pin']);
 await act(async()=>{ await result.current.showLatest(); });
 await waitFor(()=>expect(result.current.isHistoryWindow).toBe(false));
 expect(result.current.rawMessages.map(m=>m.id)).toEqual(['a','c']);
 expect(requests).toContain('b');
 unmount();client.clear();
});
test('a denied refresh hides cached private messages and pins without retrying', async () => {
 const { client, wrapper } = setup();
 let denied = false; let calls = 0;
 const readPage = async () => {
  calls++;
  if (denied) throw Object.assign(new Error('Community unavailable'),{code:'42501'});
  return {...page('secret'),pinned_message:row('secret')};
 };
 const {result,unmount}=renderHook(()=>useCommunityChatHistory({communityId:'private',walletAddress:'member',isPrivate:true,readPage}),{wrapper});
 await waitFor(()=>expect(result.current.rawMessages).toHaveLength(1));
 denied=true;
 await act(async()=>{ await result.current.refreshHistory(); });
 await waitFor(()=>expect(result.current.error).toBeTruthy());
 expect(result.current.rawMessages).toEqual([]);
 expect(result.current.pinned).toBeNull();
 expect(result.current.hasOlderMessages).toBe(false);
 expect(calls).toBe(2);
 unmount();client.clear();
});
test('switching wallets cannot show the previous wallet history', async () => {
 const {client,wrapper}=setup();
 const readPage=async ({walletAddress}:{walletAddress:string|null})=>page(walletAddress!);
 const {result,rerender,unmount}=renderHook(({wallet}:{wallet:string})=>useCommunityChatHistory({communityId:'private',walletAddress:wallet,isPrivate:true,readPage}),{wrapper,initialProps:{wallet:'a'}});
 await waitFor(()=>expect(result.current.rawMessages.map(m=>m.id)).toEqual(['a']));
 rerender({wallet:'b'});
 expect(result.current.rawMessages.every(m=>m.id!=='a')).toBe(true);
 await waitFor(()=>expect(result.current.rawMessages.map(m=>m.id)).toEqual(['b']));
 unmount();client.clear();
});
