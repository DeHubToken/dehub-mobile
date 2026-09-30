import {
  BRAINROT_PAGE_SIZE,
  BRAINROT_PATTERN,
  appendStable,
  createBrainrotSource,
  isBrainrotPlayable,
  isBrainrotSwipe,
  mixBrainrotFeed,
  windowShuffle,
  type BrainrotBucket,
  type BrainrotListInput,
  type BrainrotPost,
} from '../../libs/brainrotFeed';
import type { UnifiedFeedParams } from '../../services/feed.unified.service';

type Post = BrainrotPost & { tokenId: string; minter: string };

/** `count` posts from one list, each by its own creator unless told otherwise. */
function posts(prefix: string, count: number, creator?: (i: number) => string): Post[] {
  return Array.from({ length: count }, (_, i) => ({
    tokenId: `${prefix}${i}`,
    minter: creator ? creator(i) : `${prefix}-creator-${i}`,
  }));
}

function lists(
  overrides: Partial<Record<BrainrotBucket, BrainrotListInput<Post>>> = {},
): Record<BrainrotBucket, BrainrotListInput<Post>> {
  return {
    trending: { items: posts('t', 20), done: true },
    new: { items: posts('n', 20), done: true },
    mostViewed: { items: posts('v', 20), done: true },
    mostLiked: { items: posts('l', 20), done: true },
    mostCommented: { items: posts('c', 20), done: true },
    ...overrides,
  };
}

const PREFIX: Record<BrainrotBucket, string> = {
  trending: 't',
  new: 'n',
  mostViewed: 'v',
  mostLiked: 'l',
  mostCommented: 'c',
};

const ids = (items: Post[]) => items.map((p) => p.tokenId);

describe('mixBrainrotFeed', () => {
  it('deals the lists out in the rotation: trending and new twice, each all-time list once', () => {
    const { items } = mixBrainrotFeed(lists(), { seed: 1 });
    const firstLap = items.slice(0, BRAINROT_PATTERN.length).map((p) => p.tokenId[0]);
    expect(firstLap).toEqual(BRAINROT_PATTERN.map((bucket) => PREFIX[bucket]));
  });

  it('keeps each list roughly in rank order — only reshuffled inside blocks of four', () => {
    const { items } = mixBrainrotFeed(lists(), { seed: 7 });
    const trending = items.filter((p) => p.tokenId.startsWith('t')).map((p) => Number(p.tokenId.slice(1)));
    expect(trending.slice(0, 4).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(trending.slice(4, 8).sort((a, b) => a - b)).toEqual([4, 5, 6, 7]);
  });

  it('plays a clip once even when several lists rank it', () => {
    const shared = { tokenId: 'hit', minter: 'star' };
    const { items } = mixBrainrotFeed(
      lists({
        trending: { items: [shared, ...posts('t', 3)], done: true },
        mostViewed: { items: [shared, ...posts('v', 3)], done: true },
        mostLiked: { items: [shared, ...posts('l', 3)], done: true },
      }),
      { seed: 2 },
    );
    expect(ids(items).filter((id) => id === 'hit')).toHaveLength(1);
    expect(new Set(ids(items)).size).toBe(items.length);
  });

  it('never hands back the video the person swiped away from', () => {
    const { items } = mixBrainrotFeed(lists(), { seed: 3, excludeIds: new Set(['t0', 't1', 't2', 't3']) });
    expect(ids(items)).not.toContain('t0');
    expect(ids(items)).not.toContain('t3');
  });

  it('holds watched clips back until everything fresh has played', () => {
    const watched = new Set(['t0', 'n0', 'v0']);
    const { items } = mixBrainrotFeed(lists(), { seed: 4, watchedIds: watched });
    expect(new Set(ids(items).slice(-3))).toEqual(watched);
    expect(items).toHaveLength(100);
  });

  it('pauses on a list that has run dry but has more pages, and says which', () => {
    const { items, waitingOn } = mixBrainrotFeed(
      lists({ trending: { items: posts('t', 2), done: false } }),
      { seed: 5 },
    );
    expect(waitingOn).toBe('trending');
    // Trending has both of its slots in the first lap, so the second lap stops on its first slot.
    expect(items).toHaveLength(BRAINROT_PATTERN.length);
  });

  it('skips over a list that is finished for good', () => {
    const { items, waitingOn } = mixBrainrotFeed(
      lists({ mostCommented: { items: [], done: true }, trending: { items: [], done: true } }),
      { seed: 6 },
    );
    expect(waitingOn).toBeNull();
    expect(items).toHaveLength(60);
  });

  it('does not play the same creator twice in a row when another pick is close', () => {
    const finished = { items: [], done: true };
    for (const seed of [8, 9, 10, 11]) {
      const { items } = mixBrainrotFeed(
        {
          trending: { items: posts('t', 20, (i) => (i % 2 ? 'alice' : 'bob')), done: true },
          new: finished,
          mostViewed: finished,
          mostLiked: finished,
          mostCommented: finished,
        },
        { seed },
      );
      expect(items).toHaveLength(20);
      for (let i = 1; i < items.length - 1; i++) {
        expect(items[i].minter).not.toBe(items[i - 1].minter);
      }
    }
  });

  it('leaves out what the shorts viewer cannot gate', () => {
    const blocked: Post[] = [
      { tokenId: 'ppv', minter: 'a', streamInfo: { isPayPerView: true } },
      { tokenId: 'lock', minter: 'b', streamInfo: { isLockContent: true, lockContentAmount: 5 } },
      { tokenId: 'plans', minter: 'c', plansDetails: [{}] },
      { tokenId: 'w2e', minter: 'd', streamInfo: { isAddBounty: true } },
      { tokenId: 'mature', minter: 'e', contentRating: 'mature' },
      { tokenId: 'pending', minter: 'f', transcodingStatus: 'pending' },
      { tokenId: 'live', minter: 'g', postType: 'live' },
    ];
    const { items } = mixBrainrotFeed(lists({ trending: { items: [...blocked, ...posts('t', 2)], done: true } }), { seed: 9 });
    for (const post of blocked) expect(ids(items)).not.toContain(post.tokenId);
    expect(isBrainrotPlayable({ tokenId: 'ok', minter: 'z', postType: 'video', transcodingStatus: 'done' })).toBe(true);
    expect(isBrainrotPlayable({ tokenId: 'mine', minter: 'z', isUnlocked: true, plansDetails: [{}] })).toBe(true);
  });

  it('keeps what is already dealt in place when the next page lands', () => {
    const before = mixBrainrotFeed(lists({ trending: { items: posts('t', 12), done: false } }), { seed: 10 }).items;
    const after = mixBrainrotFeed(lists({ trending: { items: posts('t', 24), done: false } }), { seed: 10 }).items;
    expect(ids(after).slice(0, before.length)).toEqual(ids(before));
    expect(after.length).toBeGreaterThan(before.length);
  });
});

describe('windowShuffle', () => {
  it('never reorders earlier blocks when more items are appended', () => {
    const short = windowShuffle(Array.from({ length: 12 }, (_, i) => i), 42);
    const long = windowShuffle(Array.from({ length: 24 }, (_, i) => i), 42);
    expect(long.slice(0, 12)).toEqual(short);
  });

  it('shuffles differently for different openings', () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    expect(windowShuffle(items, 1)).not.toEqual(windowShuffle(items, 2));
  });
});

describe('appendStable', () => {
  it('keeps the clips already on screen and adds only new ones after them', () => {
    const idOf = (s: { id: string }) => s.id;
    const shown = [{ id: 'a' }, { id: 'b' }];
    const next = [{ id: 'b' }, { id: 'c' }, { id: 'a' }, { id: 'd' }];
    expect(appendStable(shown, next, idOf).map(idOf)).toEqual(['a', 'b', 'c', 'd']);
    expect(appendStable(shown, [{ id: 'a' }], idOf)).toBe(shown);
  });
});

describe('isBrainrotSwipe', () => {
  it('counts a clear upward drag or a quick upward flick', () => {
    expect(isBrainrotSwipe(-120, 0)).toBe(true);
    expect(isBrainrotSwipe(-40, -1200)).toBe(true);
  });
  it('ignores a nudge, a slow short drag and anything downward', () => {
    expect(isBrainrotSwipe(-10, -2000)).toBe(false);
    expect(isBrainrotSwipe(-50, -100)).toBe(false);
    expect(isBrainrotSwipe(200, 0)).toBe(false);
  });
});

describe('createBrainrotSource', () => {
  const RANGES: Record<string, number> = {
    'views|week': 1000,
    'createdAt|': 2000,
    'views|': 3000,
    'likes|': 4000,
    'comments|': 5000,
  };

  function fakeFeed(pages = 3) {
    const calls: string[] = [];
    const fetchPage = jest.fn(async (params: UnifiedFeedParams) => {
      const key = `${params.sortBy}|${params.range ?? ''}`;
      calls.push(`${key}#${params.page}`);
      const base = RANGES[key] + ((params.page ?? 1) - 1) * BRAINROT_PAGE_SIZE;
      return {
        result: Array.from({ length: BRAINROT_PAGE_SIZE }, (_, i) => ({
          tokenId: String(base + i),
          minter: `creator-${base + i}`,
          postType: 'video' as const,
        })),
        pagination: { page: params.page ?? 1, limit: BRAINROT_PAGE_SIZE, totalCount: 999, totalPages: pages, hasMore: (params.page ?? 1) < pages },
      };
    });
    return { fetchPage, calls };
  }

  it('opens with a page of every list, dealt in the rotation, minus the video it came from', async () => {
    const { fetchPage, calls } = fakeFeed();
    const source = createBrainrotSource({ seed: 1, fromId: 1000, fetchPage });
    const { items, done } = await source.next();
    expect(calls.sort()).toEqual(['comments|#1', 'createdAt|#1', 'likes|#1', 'views|#1', 'views|week#1']);
    expect(done).toBe(false);
    expect(items.map((p) => p.tokenId)).not.toContain('1000');
    const lap = items.slice(0, 7).map((p) => Math.floor(Number(p.tokenId) / 1000));
    expect(lap).toEqual([1, 3, 2, 1, 4, 2, 5]);
  });

  it('pages in only the list the rotation is waiting on, and never repeats a clip', async () => {
    const { fetchPage, calls } = fakeFeed();
    const source = createBrainrotSource({ seed: 2, fetchPage });
    const first = await source.next();
    calls.length = 0;
    const second = await source.next();
    expect(calls).toHaveLength(1);
    expect(second.items.length).toBeGreaterThan(0);
    const all = [...first.items, ...second.items].map((p) => p.tokenId);
    expect(new Set(all).size).toBe(all.length);
  });

  it('reports done once every list has run out', async () => {
    const { fetchPage } = fakeFeed(1);
    const source = createBrainrotSource({ seed: 3, fetchPage });
    const { items, done } = await source.next();
    expect(done).toBe(true);
    expect(items).toHaveLength(5 * BRAINROT_PAGE_SIZE);
  });

  it('carries on without a list that fails to load', async () => {
    const { fetchPage } = fakeFeed();
    fetchPage.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    const source = createBrainrotSource({ seed: 4, fetchPage });
    const { items } = await source.next();
    expect(items.length).toBeGreaterThan(0);
  });

  it('puts clips the account has watched last', async () => {
    const { fetchPage } = fakeFeed(1);
    const source = createBrainrotSource({
      seed: 5,
      fetchPage,
      loadWatchedIds: async () => new Set(['1000', '2000']),
    });
    const { items } = await source.next();
    expect(new Set(items.slice(-2).map((p) => p.tokenId))).toEqual(new Set(['1000', '2000']));
  });
});
