
import { fetchPredictionPreview, formatPredictionProbability, normalizePrediction, parsePredictionLink } from '../../libs/predictions';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });
const poly = (slug: string) => parsePredictionLink(`https://polymarket.com/event/${slug}`)!;
const manifold = (slug: string) => parsePredictionLink(`https://manifold.markets/person/${slug}`)!;
const market = (slug = 'question') => ({ slug, question: 'Will it happen?', outcomes: '["Yes","No"]', outcomePrices: '["0.65","0.35"]', closed: false });

describe('prediction links', () => {
  it('canonicalizes shared URLs, stripping tracking and preserving the chosen market', () => {
    expect(parsePredictionLink('www.polymarket.com/event/election/candidate?tid=123#chart')).toEqual({
      provider: 'polymarket', kind: 'event', slug: 'election', marketSlug: 'candidate', url: 'https://polymarket.com/event/election/candidate',
    });
    expect(manifold('question').url).toBe('https://manifold.markets/person/question');
    expect(parsePredictionLink('https://polymarket.com/market/question')?.kind).toBe('market');
  });

  it('rejects spoofed domains, credentials, ports, encoded paths and non-market routes', () => {
    for (const url of [
      'https://polymarket.com.attacker.com/event/test', 'https://polymarket.com@attacker.com/event/test',
      'https://user@polymarket.com/event/test', 'https://polymarket.com:444/event/test',
      'https://polymarket.com/event/test%2Fother', 'https://polymarket.com/profile/person',
      'https://manifold.markets/topic/politics', 'https://api.manifold.markets/v0/markets',
      'https://kalshi.com/markets/test', 'javascript:alert(1)',
    ]) expect(parsePredictionLink(url)).toBeNull();
  });
});

describe('provider data', () => {
  it('shows each event question separately, active questions first', () => {
    const result = normalizePrediction(poly('event'), { slug: 'event', title: 'Which outcome?', markets: [
      { ...market('past'), closed: true, umaResolutionStatus: 'resolved' }, market('future'),
    ] }, 100);
    expect(result?.prediction.markets.map(m => m.status)).toEqual(['open', 'resolved']);
    expect(result?.prediction.markets[0].outcomes).toEqual([{ label: 'Yes', probability: 0.65 }, { label: 'No', probability: 0.35 }]);
    expect(result?.prediction.fetchedAt).toBe(100);
  });

  it('resolves a specific nested market and never substitutes another question', () => {
    const link = parsePredictionLink('https://polymarket.com/event/election/chosen')!;
    const data = { slug: 'election', title: 'Election', markets: [market('other'), { ...market('chosen'), question: 'Chosen candidate?' }] };
    expect(normalizePrediction(link, data)?.title).toBe('Chosen candidate?');
    expect(normalizePrediction({ ...link, marketSlug: 'missing' }, data)).toBeNull();
  });

  it('does not coerce null, empty, malformed or out-of-range prices to odds', () => {
    const data = { slug: 'event', title: 'Event', markets: [{ ...market(), outcomes: ['A', 'B', 'C', 'D', 'E'], outcomePrices: [null, '', 1.2, 'invalid', '0'] }] };
    expect(normalizePrediction(poly('event'), data)?.prediction.markets[0].outcomes).toEqual([{ label: 'E', probability: 0 }]);
    expect(normalizePrediction(poly('event'), { ...data, markets: [{ ...market(), outcomePrices: '{bad' }] })?.prediction.markets[0].outcomes).toEqual([]);
    expect(normalizePrediction(poly('other'), data)).toBeNull();
  });

  it('uses settled Manifold outcomes and hides odds for cancelled and non-binary markets', () => {
    const link = manifold('question');
    const data = { slug: 'question', url: link.url, question: 'Question?', outcomeType: 'BINARY', probability: 0.7, closeTime: 200 };
    expect(normalizePrediction(link, data, 100)?.prediction.markets[0].status).toBe('open');
    expect(normalizePrediction(link, data, 300)?.prediction.markets[0].status).toBe('closed');
    const resolved = normalizePrediction(link, { ...data, isResolved: true, resolution: 'NO' });
    expect(resolved?.prediction.markets[0].outcomes[0].probability).toBe(0);
    expect(resolved?.prediction.markets[0].status).toBe('resolved');
    for (const extra of [{ isResolved: true, resolution: 'CANCEL' }, { outcomeType: 'PSEUDO_NUMERIC' }, { outcomeType: 'POLL' }]) {
      expect(normalizePrediction(link, { ...data, ...extra })?.prediction.markets[0].outcomes).toEqual([]);
    }
    expect(normalizePrediction(link, { ...data, visibility: 'unlisted' })).toBeNull();
    expect(normalizePrediction(link, { ...data, url: 'https://attacker.com/question' })).toBeNull();
  });

  it('keeps independent multiple-choice probabilities separate instead of renormalizing them', () => {
    const link = manifold('question');
    const result = normalizePrediction(link, { slug: link.slug, url: link.url, question: 'Which?', outcomeType: 'MULTIPLE_CHOICE', answers: [
      { text: 'A', probability: 0.8 }, { text: 'B', probability: 0.8 }, { text: 'Unknown', probability: null },
    ] });
    expect(result?.prediction.markets[0].outcomes.map(o => o.probability)).toEqual([0.8, 0.8]);
  });

  it('does not round near-certainty to a settled 0% or 100%', () => {
    expect(formatPredictionProbability(0.9999, 'en')).toBe('>99.9%');
    expect(formatPredictionProbability(0.0001, 'en')).toBe('<0.1%');
    expect(formatPredictionProbability(1, 'en')).toBe('100%');
    expect(formatPredictionProbability(0, 'en')).toBe('0%');
  });
});

describe('public requests', () => {
  it('deduplicates concurrent requests and re-fetches an expired snapshot', async () => {
    const link = poly('cache-test');
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ slug: link.slug, title: 'Cached event', markets: [market()] }) });
    globalThis.fetch = fetcher;
    const [a, b] = await Promise.all([fetchPredictionPreview(link), fetchPredictionPreview(link)]);
    expect(a).toBe(b);
    await fetchPredictionPreview(link);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://gamma-api.polymarket.com/events/slug/cache-test', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
    now.mockReturnValue(161_000);
    expect((await fetchPredictionPreview(link)).prediction.fetchedAt).toBe(161_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains a source link without fabricated odds on rate limits and does not retry', async () => {
    const link = manifold('rate-limit-test');
    const fetcher = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    globalThis.fetch = fetcher;
    const preview = await fetchPredictionPreview(link);
    expect(preview.url).toBe(link.url);
    expect(preview.prediction.markets).toEqual([]);
    expect(preview.prediction.fetchedAt).toBeNull();
    await fetchPredictionPreview(link);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
