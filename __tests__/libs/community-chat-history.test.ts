import { QueryClient } from '@tanstack/react-query';
import { compareCommunityMessages, communityHistoryMessages, updateCommunityChatCache, type CommunityChatHistory } from '../../libs/community-chat-history';
type Row = { id: string; created_at: string; content: string };
const row = (id: string, fraction = '123456'): Row => ({ id, created_at: '2026-10-01T12:00:00.' + fraction + 'Z', content: id });
const history = (): CommunityChatHistory<Row> => ({
 pages: [
  { messages: [row('c'), row('b')], references: [row('a')], pinned_message: row('a'), next_cursor: row('b') },
  { messages: [row('b'), row('a')], references: [], pinned_message: row('a'), next_cursor: null },
 ],
 pageParams: [null, row('b')],
});
test('preserves microseconds and uses IDs to order equal timestamps', () => {
 expect(compareCommunityMessages(row('z', '123455'), row('a', '123456'))).toBeLessThan(0);
 expect(compareCommunityMessages(row('a'), row('b'))).toBeLessThan(0);
 expect(compareCommunityMessages(row('a', '1'), row('a', '100000'))).toBe(0);
 expect(compareCommunityMessages({ ...row('a'), created_at: '2026-10-01T12:00:00+00:00' }, row('a', '000000'))).toBe(0);
});
test('deduplicates page overlap and retains the newest version', () => {
 const data = history();
 data.pages[0].messages[1].content = 'edited';
 const messages = communityHistoryMessages(data);
 expect(messages.map(m => m.id)).toEqual(['a', 'b', 'c']);
 expect(messages[1].content).toBe('edited');
});
test('confirmed sends and duplicate events add one row without moving the cursor', () => {
 const client = new QueryClient();
 const key = ['chat', 'wallet-a'];
 client.setQueryData(key, history());
 for (let i=0;i<2;i++) updateCommunityChatCache<Row>(client,key,rows=>rows.some(m=>m.id==='d')?rows:[...rows,row('d')]);
 const data = client.getQueryData<CommunityChatHistory<Row>>(key)!;
 expect(communityHistoryMessages(data).map(m=>m.id)).toEqual(['a','b','c','d']);
 expect(data.pages[0].next_cursor).toEqual(row('b'));
 expect(data.pageParams).toEqual([null,row('b')]);
 client.clear();
});
test('edits and deletions reconcile old replies and off-page pins', () => {
 const client = new QueryClient();
 const key = ['chat', 'wallet-a'];
 client.setQueryData(key, history());
 updateCommunityChatCache<Row>(client,key,rows=>rows.map(m=>m.id==='a'?{...m,content:'edited parent'}:m));
 let data = client.getQueryData<CommunityChatHistory<Row>>(key)!;
 expect(data.pages[0].references[0].content).toBe('edited parent');
 expect(data.pages[0].pinned_message?.content).toBe('edited parent');
 expect(communityHistoryMessages(data)[0].content).toBe('edited parent');
 updateCommunityChatCache<Row>(client,key,rows=>rows.filter(m=>m.id!=='a'));
 data = client.getQueryData<CommunityChatHistory<Row>>(key)!;
 expect(data.pages[0].references).toEqual([]);
 expect(data.pages[0].pinned_message).toBeNull();
 expect(communityHistoryMessages(data).map(m=>m.id)).toEqual(['b','c']);
 expect(client.getQueryData(['chat','wallet-b'])).toBeUndefined();
 client.clear();
});
test('a realtime event cannot create an unauthorised cache before the first read', () => {
 const client = new QueryClient();
 updateCommunityChatCache<Row>(client,['unknown'],rows=>[...rows,row('a')]);
 expect(client.getQueryData(['unknown'])).toBeUndefined();
 client.clear();
});
