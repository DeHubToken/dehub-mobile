import {
  brainrotFirstPages,
  resetBrainrotWarm,
  warmBrainrotFeed,
  warmedBrainrotPage,
  warmedWatchedIds,
} from '../../libs/brainrotWarm';

describe('brainrotWarm', () => {
  beforeEach(() => resetBrainrotWarm());

  it('warms each list once and the viewer joins those requests', async () => {
    const fetchPage = jest.fn(async (params: any) => ({ result: [params.sortBy] }));
    warmBrainrotFeed({ account: 'a', fetchPage });
    warmBrainrotFeed({ account: 'a', fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(5);

    const take = warmedBrainrotPage('a', fetchPage);
    for (const params of brainrotFirstPages()) await take(params);
    expect(fetchPage).toHaveBeenCalledTimes(5);

    // Page two, or another account, goes to the network.
    await take({ ...brainrotFirstPages()[0], page: 2 });
    await warmedBrainrotPage('b', fetchPage)(brainrotFirstPages()[0]);
    expect(fetchPage).toHaveBeenCalledTimes(7);
  });

  it('retries a warmed request that failed', async () => {
    const fetchPage = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ result: ['ok'] });
    warmBrainrotFeed({ account: '', fetchPage: (p: any) => (p.sortBy === 'views' && p.range === 'week' ? fetchPage(p) : Promise.resolve({ result: [] })) });
    const res = await warmedBrainrotPage('', fetchPage)(brainrotFirstPages()[0]);
    expect(res).toEqual({ result: ['ok'] });
  });

  it('shares the watched ids with the viewer for the same account only', async () => {
    const load = jest.fn(async () => new Set(['1']));
    warmBrainrotFeed({ account: 'a', fetchPage: async () => ({}), loadWatchedIds: load });
    await warmedWatchedIds('a', load)();
    expect(load).toHaveBeenCalledTimes(1);
    await warmedWatchedIds('b', load)();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
