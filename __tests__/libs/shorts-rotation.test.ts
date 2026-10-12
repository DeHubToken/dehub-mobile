
import { extendShortsDraw, shortsBatchCount, shortsBatchIndex, readShortsHistory, rememberShorts } from '../../libs/shortsRotation';

const videos = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
  tokenId: start + i + 1, postType: 'video', videoDuration: 120,
}));

it('inserts after 6 posts and every 12 thereafter', () => {
  expect([5, 6, 17, 18, 29, 30, 42].map(shortsBatchCount)).toEqual([0, 1, 1, 2, 2, 3, 4]);
  expect([5, 6, 7, 18, 30, 42].map(shortsBatchIndex)).toEqual([-1, 0, -1, 1, 2, 3]);
});

it('makes distinct ten-item rows, including when offset pages overlap', () => {
  const pool = [...videos(40), ...videos(10)];
  const rows = extendShortsDraw([], pool, 3, 'visit-one', [], false);
  expect(rows.map(row => row.length)).toEqual([10, 10, 10]);
  expect(new Set(rows.flat()).size).toBe(30);
});

it('chooses different content on a new visit and avoids the previous selection', () => {
  const pool = videos(40);
  const first = extendShortsDraw([], pool, 1, 'visit-one', [], false);
  const second = extendShortsDraw([], pool, 1, 'visit-two', first.flat(), false);
  expect(second[0].some(id => first[0].includes(id))).toBe(false);
  expect(second).not.toEqual(first);
  expect(extendShortsDraw([], pool, 1, 'visit-one', [], false)).toEqual(first);
});

it('keeps prior rows fixed when more candidates or feed pages arrive', () => {
  const first = extendShortsDraw([], videos(20), 1, 'visit', [], false);
  const deeper = extendShortsDraw(first, [...videos(20), ...videos(30, 20)], 4, 'visit', [], false);
  expect(deeper[0]).toEqual(first[0]);
  expect(new Set(deeper.flat()).size).toBe(40);
});

it('keeps long videos first and alternates soundtrack photos', () => {
  const pool = [...videos(12).map(item => ({ ...item, videoDuration: 30 })), ...videos(12, 20),
    ...videos(12, 40).map(item => ({ ...item, postType: 'feed-images' }))];
  const row = extendShortsDraw([], pool, 1, 'visit', [], false)[0];
  const byId = new Map(pool.map(item => [String(item.tokenId), item]));
  expect(row.map(id => byId.get(id)?.postType)).toEqual(Array.from({ length: 10 }, (_, i) => i % 2 ? 'feed-images' : 'video'));
  expect(row.filter((_, i) => i % 2 === 0).every(id => byId.get(id)?.videoDuration === 120)).toBe(true);
});

it('waits for enough candidates while more pages exist, then uses a thin pool without duplicates in a row', () => {
  expect(extendShortsDraw([], videos(7), 1, 'visit', [], false)).toEqual([]);
  const rows = extendShortsDraw([], videos(7), 3, 'visit', [], true);
  expect(rows).toHaveLength(3);
  expect(rows.every(row => row.length === 7 && new Set(row).size === 7)).toBe(true);
  expect(extendShortsDraw([], [], 4, 'visit', [], true)).toEqual([]);
});

it('only repeats content in deeper rows after the available pool is exhausted', () => {
  const rows = extendShortsDraw([], videos(20), 4, 'visit', [], true);
  expect(new Set(rows.slice(0, 2).flat()).size).toBe(20);
  expect(rows.map(row => row.length)).toEqual([10, 10, 10, 10]);
});

it('keeps malformed or oversized local history from breaking selection', () => {
  expect(readShortsHistory('{bad')).toEqual([]);
  expect(readShortsHistory('{}')).toEqual([]);
  expect(readShortsHistory('[1,"2",null]')).toEqual(['2']);
  expect(rememberShorts([], [videos(230).map(item => String(item.tokenId))])).toHaveLength(200);
});
