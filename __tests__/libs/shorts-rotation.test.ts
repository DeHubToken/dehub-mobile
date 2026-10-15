
import { extendShortsDraw, shortsBatchCount, shortsBatchIndex, readShortsHistory, rememberShorts, uniqueShortsCreators } from '../../libs/shortsRotation';

const videos = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({
  tokenId: start + i + 1, postType: 'video', videoDuration: 120,
}));

it('allows each creator only once per row across videos and photos', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({
    tokenId: i + 1, minter: `0xCreator${i % 10}`,
    postType: i < 20 ? 'video' : 'feed-images', videoDuration: 120,
  }));
  const rows = extendShortsDraw([], pool, 3, 'creators', [], false);
  const byId = new Map(pool.map(item => [String(item.tokenId), item.minter.toLowerCase()]));
  expect(rows.map(row => row.length)).toEqual([10, 10, 10]);
  expect(new Set(rows.flat()).size).toBe(30);
  expect(rows.every(row => new Set(row.map(id => byId.get(id))).size === row.length)).toBe(true);
});

it('normalizes creator addresses and usernames without grouping unknown creators together', () => {
  expect(uniqueShortsCreators([
    { tokenId: 1, minter: ' 0xABC ' },
    { tokenId: 2, minter: '0xabc' },
    { tokenId: 3, creatorId: '0xABC' },
    { tokenId: 4, minterUsername: ' Alice ' },
    { tokenId: 5, minterUsername: 'alice' },
    { tokenId: 6 },
    { tokenId: 7 },
    { tokenId: 8, minter: '0xdef', minterUsername: 'alice' },
  ]).map(item => item.tokenId)).toEqual([1, 4, 6, 7, 8]);
});

it('waits for more creators even when many posts exist, then keeps thin rows creator-unique', () => {
  const pool = videos(30).map((item, i) => ({ ...item, minter: `creator-${i % 3}` }));
  expect(extendShortsDraw([], pool, 1, 'thin-creators', [], false)).toEqual([]);
  const rows = extendShortsDraw([], pool, 12, 'thin-creators', [], true);
  const byId = new Map(pool.map(item => [String(item.tokenId), item.minter]));
  expect(rows).toHaveLength(12);
  expect(rows.every(row => row.length === 3 && new Set(row.map(id => byId.get(id))).size === 3)).toBe(true);
  expect(new Set(rows.slice(0, 10).flat()).size).toBe(30);
});

it('preserves existing creator-unique rows when more pages arrive', () => {
  const pool = videos(20).map((item, i) => ({ ...item, minter: `creator-${i % 10}` }));
  const first = extendShortsDraw([], pool, 1, 'pages', [], false);
  const more = videos(10, 20).map((item, i) => ({ ...item, minter: `creator-${i}` }));
  const rows = extendShortsDraw(first, [...pool, ...more], 3, 'pages', [], false);
  expect(rows[0]).toEqual(first[0]);
  expect(rows.map(row => row.length)).toEqual([10, 10, 10]);
  expect(new Set(rows.flat()).size).toBe(30);
});


it('keeps the opening rail, then inserts after 6 posts and every 12 thereafter', () => {
  expect([0, 1, 5, 6, 17, 18, 29, 30, 42].map(shortsBatchCount)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5]);
  expect([0, 1, 5, 6, 7, 18, 30, 42].map(shortsBatchIndex)).toEqual([-1, 0, -1, 1, -1, 2, 3, 4]);
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
