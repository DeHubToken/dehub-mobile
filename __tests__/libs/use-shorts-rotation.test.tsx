
import { renderHook, waitFor } from '@testing-library/react-native';
import { useShortsRotation, type ShortsHistoryStore } from '../../hooks/useShortsRotation';

const pool = Array.from({ length: 40 }, (_, i) => ({ tokenId: i + 1, postType: 'video', videoDuration: 120 }));

it('preserves the draw on rerenders and extends it without moving the first carousel', async () => {
  const storage = new Map<string, string>();
  const store: ShortsHistoryStore = { read: async key => storage.get(key) ?? null,
    write: async (key, value) => { storage.set(key, value); } };
  const { result, rerender } = renderHook(({ count, visit }) =>
    useShortsRotation(pool, count, visit, 'viewer', store, true, false),
    { initialProps: { count: 1, visit: 'entry-one' } });
  await waitFor(() => expect(result.current.batches).toHaveLength(1));
  const first = result.current.batches[0].map(item => item.tokenId);
  rerender({ count: 2, visit: 'entry-one' });
  await waitFor(() => expect(result.current.batches).toHaveLength(2));
  expect(result.current.batches[0].map(item => item.tokenId)).toEqual(first);
  expect(new Set(result.current.batches.flat().map(item => item.tokenId)).size).toBe(20);

  rerender({ count: 1, visit: 'entry-two' });
  await waitFor(() => expect(result.current.batches).toHaveLength(1));
  expect(result.current.batches[0].some(item => first.includes(item.tokenId))).toBe(false);
});

it('continues to render if device storage is unavailable', async () => {
  const store: ShortsHistoryStore = { read: async () => { throw new Error('unavailable'); },
    write: async () => { throw new Error('unavailable'); } };
  const { result } = renderHook(() => useShortsRotation(pool, 1, 'visit', 'viewer', store, true, false));
  await waitFor(() => expect(result.current.batches[0]).toHaveLength(10));
});

it('never shows the previous viewers selection while a new history read is pending', async () => {
  let resolveRead: ((value: string | null) => void) | undefined;
  const store: ShortsHistoryStore = { read: async key => key === 'first' ? null : new Promise(resolve => { resolveRead = resolve; }),
    write: async () => {} };
  const { result, rerender } = renderHook(({ viewer }) =>
    useShortsRotation(pool, 1, viewer, viewer, store, true, false),
    { initialProps: { viewer: 'first' } });
  await waitFor(() => expect(result.current.batches).toHaveLength(1));
  rerender({ viewer: 'second' });
  expect(result.current.batches).toEqual([]);
  resolveRead?.(null);
  await waitFor(() => expect(result.current.batches).toHaveLength(1));
});
