/** Public, read-only prediction previews. Keep in sync with mobile libs/predictions.ts. */
export type PredictionProvider = 'polymarket' | 'manifold';
export type PredictionStatus = 'open' | 'closed' | 'resolved';
export interface PredictionLink {
  provider: PredictionProvider;
  url: string;
  slug: string;
  marketSlug?: string;
  kind: 'event' | 'market';
}
export interface PredictionMarket {
  question: string;
  status: PredictionStatus;
  outcomes: { label: string; probability: number }[];
}
export interface PredictionPreview {
  url: string;
  title: string;
  description: string;
  image: null;
  siteName: string;
  prediction: {
    provider: PredictionProvider;
    fetchedAt: number | null;
    markets: PredictionMarket[];
    totalMarkets: number;
  };
}

const SLUG = /^[a-zA-Z0-9_-]{1,250}$/;

/** Only canonical provider hosts and market paths; never fetch a pasted API URL. */
export function parsePredictionLink(input: string): PredictionLink | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
    if (!parts.every(part => SLUG.test(part))) return null;
    if (host === 'polymarket.com' && ['event', 'market'].includes(parts[0]) && parts.length >= 2 && parts.length <= 3) {
      return {
        provider: 'polymarket', kind: parts[0] as 'event' | 'market', slug: parts[1],
        marketSlug: parts[2], url: `https://polymarket.com/${parts.join('/')}`,
      };
    }
    if (host === 'manifold.markets' && parts.length === 2 && !['profile', 'group', 'topic', 'search', 'embed', 'api'].includes(parts[0])) {
      return { provider: 'manifold', kind: 'market', slug: parts[1], url: `https://manifold.markets/${parts.join('/')}` };
    }
  } catch { /* ordinary outside link */ }
  return null;
}

type RecordData = Record<string, unknown>;
function record(value: unknown): RecordData {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordData : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 500) : '';
}
function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { /* malformed provider data */ }
  }
  return [];
}
function probability(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

export function formatPredictionProbability(value: number, locale?: string): string {
  // A rounded 100% would imply certainty for an unresolved 99.99% market.
  if (value > 0 && value < 0.001) return '<0.1%';
  if (value < 1 && value > 0.999) return '>99.9%';
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function polyMarket(value: unknown): PredictionMarket | null {
  const market = record(value);
  const question = text(market.question);
  if (!question) return null;
  const prices = array(market.outcomePrices);
  const outcomes = array(market.outcomes).flatMap((label, index) => {
    const price = probability(prices[index]);
    return typeof label === 'string' && price !== null ? [{ label: label.slice(0, 200), probability: price }] : [];
  });
  return { question, outcomes: outcomes.slice(0, 4), status: market.umaResolutionStatus === 'resolved' ? 'resolved' : market.closed === true ? 'closed' : 'open' };
}

export function normalizePrediction(link: PredictionLink, value: unknown, now = Date.now()): PredictionPreview | null {
  const data = record(value);
  if (link.provider === 'polymarket') {
    const isEvent = link.kind === 'event';
    const title = text(isEvent ? data.title : data.question);
    if (!title || data.slug !== link.slug) return null;
    const all = isEvent ? array(data.markets) : [data];
    // A nested market URL must never silently display a different question.
    const selected = link.marketSlug ? all.filter(item => record(item).slug === link.marketSlug) : all;
    const markets = selected.map(polyMarket).filter((item): item is PredictionMarket => item !== null);
    if (!markets.length) return null;
    // Active markets first, without confusing an event's first outcome with its overall odds.
    markets.sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open'));
    return {
      url: link.url, title: link.marketSlug ? markets[0].question : title, description: '', image: null, siteName: 'Polymarket',
      prediction: { provider: link.provider, fetchedAt: now, markets: markets.slice(0, 3), totalMarkets: markets.length },
    };
  }
  const title = text(data.question);
  if (!title || data.slug !== link.slug || data.visibility === 'private' || data.visibility === 'unlisted') return null;
  const canonical = parsePredictionLink(text(data.url));
  if (!canonical || canonical.provider !== 'manifold' || canonical.slug !== link.slug) return null;
  const cancelled = data.resolution === 'CANCEL';
  const status: PredictionStatus = data.isResolved === true ? 'resolved' : typeof data.closeTime === 'number' && data.closeTime <= now ? 'closed' : 'open';
  let outcomes: PredictionMarket['outcomes'] = [];
  // Numeric, poll and bounty probabilities have different semantics. Never label them Yes/No.
  if (!cancelled && data.outcomeType === 'BINARY') {
    const p = data.resolution === 'YES' ? 1 : data.resolution === 'NO' ? 0
      : data.isResolved === true ? probability(data.resolutionProbability) : probability(data.probability);
    if (p !== null) outcomes = [{ label: 'Yes', probability: p }, { label: 'No', probability: 1 - p }];
  } else if (!cancelled && data.outcomeType === 'MULTIPLE_CHOICE' && data.isResolved !== true) {
    outcomes = array(data.answers).flatMap(value => {
      const answer = record(value);
      const p = probability(answer.probability);
      return text(answer.text) && p !== null ? [{ label: text(answer.text), probability: p }] : [];
    }).slice(0, 4);
  }
  return {
    url: canonical.url, title, description: '', image: null, siteName: 'Manifold',
    prediction: { provider: link.provider, fetchedAt: now, markets: [{ question: title, status, outcomes }], totalMarkets: 1 },
  };
}

const cache = new Map<string, { until: number; preview: PredictionPreview }>();
const pending = new Map<string, Promise<PredictionPreview>>();

export function fetchPredictionPreview(link: PredictionLink): Promise<PredictionPreview> {
  const cached = cache.get(link.url);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.preview);
  const existing = pending.get(link.url);
  if (existing) return existing;
  const request = (async () => {
    let preview: PredictionPreview = {
      url: link.url, title: (link.marketSlug || link.slug).replace(/-/g, ' '), description: '', image: null,
      siteName: link.provider === 'polymarket' ? 'Polymarket' : 'Manifold',
      prediction: { provider: link.provider, fetchedAt: null, markets: [], totalMarkets: 0 },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const endpoint = link.provider === 'polymarket'
        ? `https://gamma-api.polymarket.com/${link.kind === 'event' ? 'events' : 'markets'}/slug/${encodeURIComponent(link.slug)}`
        : `https://api.manifold.markets/v0/slug/${encodeURIComponent(link.slug)}`;
      const response = await fetch(endpoint, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (response.ok) preview = normalizePrediction(link, await response.json()) ?? preview;
    } catch { /* Keep a usable provider link when offline, rate-limited or unavailable. No retry loop. */ }
    finally { clearTimeout(timeout); }
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(link.url, { until: Date.now() + (preview.prediction.fetchedAt ? 60_000 : 30_000), preview });
    return preview;
  })().finally(() => { pending.delete(link.url); });
  pending.set(link.url, request);
  return request;
}
