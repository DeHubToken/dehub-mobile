import { extractShareUrls, parseRichLink, publicMediaUrl } from '../../libs/rich-links';
import { fetchRichPreview, normalizeRichPreview } from '../../libs/rich-link-data';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });
const cid = 'QmWbpCtwdLzxuLKnMW4Vv4MPFd2pdPX71YBKPasfZxqLUS';
const link = (url: string) => parseRichLink(url)!;
const reply = (value: unknown) => ({ ok: true, headers: new Headers(), text: async () => JSON.stringify(value) }) as Response;

describe('share link recognition', () => {
  it('recognizes all six providers and normalizes tracking and gateway variants', () => {
    expect(link('https://snapshot.box/#/s:yam.eth/proposal/' + cid).provider).toBe('snapshot');
    expect(link('https://audius.co/artist/album/record').kind).toBe('playlist');
    expect(link('defillama.com/protocol/aave?utm_source=post').url).toBe('https://defillama.com/protocol/aave');
    expect(link('github.com/org/repo/pull/42').id).toBe('org/repo/pulls/42');
    expect(link('https://github.com/org/repo/releases/tag/v1.2.3').kind).toBe('release');
    expect(link('vitalik.eth').url).toBe('https://app.ens.domains/vitalik.eth');
    expect(link('ipfs://' + cid + '/picture.png').url).toBe('https://ipfs.filebase.io/ipfs/' + cid + '/picture.png');
    expect(link('https://ipfs.io/ipfs/' + cid).url).toBe('https://ipfs.filebase.io/ipfs/' + cid);
    expect(link('https://ipfs.filebase.io/ipfs/' + cid).id).toBe(cid);
    expect(link('https://dweb.link/ipfs/' + cid).id).toBe(cid);
  });
  it('rejects spoofed domains, non-public routes, traversal and executable URLs', () => {
    for (const url of [
      'https://github.com.attacker.org/org/repo', 'https://github.com@attacker.org/org/repo',
      'https://user@github.com/org/repo', 'https://github.com:444/org/repo', 'https://github.com/org/repo/settings',
      'https://github.com/org/../repo', 'https://github.com/org/%2e%2e/repo',
      'https://audius.co/embed/track', 'https://defillama.com/not-protocol/aave',
      'ipfs://' + cid + '/%2e%2e/secrets', 'ipfs://not-a-cid/file', 'javascript:alert(1)',
      'https://example.org/ipfs/' + cid, 'https://app.ens.domains/invalid.eth.attacker.com',
    ]) expect(parseRichLink(url)).toBeNull();
  });
  it('extracts ENS and IPFS in text order without picking suffixes from emails or hostile hosts', () => {
    expect(extractShareUrls('hello vitalik.eth then (github.com/org/repo), ipfs://' + cid)).toEqual([
      'https://app.ens.domains/vitalik.eth', 'https://github.com/org/repo', 'https://ipfs.filebase.io/ipfs/' + cid,
    ]);
    expect(extractShareUrls('person@vitalik.eth vitalik.eth.attacker.com data.pdf 2.5x')).toEqual([]);
    expect(extractShareUrls('dehub.io/work https://dehub.io/work')).toEqual(['https://dehub.io/work']);
    expect(extractShareUrls('https://notgithub.com/org/repo')[0]).toBe('https://notgithub.com/org/repo');
  });
  it('rejects non-public or executable image sources', () => {
    for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', 'https://127.0.0.1/x', 'https://localhost/x', 'https://user@host.com/x', 'http://host.com/x']) expect(publicMediaUrl(url)).toBeNull();
    expect(publicMediaUrl('https://cdn.example.org/art.png')).toBe('https://cdn.example.org/art.png');
  });
});

describe('provider normalization', () => {
  it('shows weighted Snapshot scores with bounded bars and validates proposal and space', () => {
    const p = link('https://snapshot.org/#/yam.eth/proposal/' + cid);
    const fixture = { id: cid, title: 'A proposal', space: { id: 'yam.eth', name: 'Yam' }, state: 'active', choices: ['Yes', 'No'], scores: [30, 10], scores_total: 40, end: 1800000000 };
    const result = normalizeRichPreview(p, fixture, 100)!;
    expect(result.rich.choices).toEqual([{ label: 'Yes', score: 30, share: 0.75 }, { label: 'No', score: 10, share: 0.25 }]);
    expect(result.rich.status).toBe('active');
    expect(result.rich.endsAt).toBe(1800000000000);
    expect(normalizeRichPreview(p, { ...fixture, id: 'another' })).toBeNull();
    expect(normalizeRichPreview(p, { ...fixture, space: { id: 'another.eth' } })).toBeNull();
  });
  it('does not present unavailable TVL as zero', () => {
    const p = link('https://defillama.com/protocol/aave');
    expect(normalizeRichPreview(p, 'not-found')).toBeNull();
    expect(normalizeRichPreview(p, 0)?.rich.metrics).toEqual([{ kind: 'tvl', value: 0 }]);
  });
  it('only exposes playable public Audius tracks and never fabricates a stream for gated music', () => {
    const p = link('https://audius.co/artist/song');
    const fixture = { id: 'Track123', title: 'A song', user: { name: 'Artist' }, access: { stream: true }, is_streamable: true, is_stream_gated: false, duration: 120 };
    expect(normalizeRichPreview(p, fixture)?.rich.audioUrl).toContain('/tracks/Track123/stream?app_name=DeHub');
    for (const patch of [{ is_stream_gated: true }, { access: { stream: false } }, { access_authorities: ['authority'] }, { stream_conditions: { usdc_purchase: {} } }]) {
      expect(normalizeRichPreview(p, { ...fixture, ...patch })?.rich.audioUrl).toBeUndefined();
    }
    expect(normalizeRichPreview(p, { ...fixture, is_unlisted: true })).toBeNull();
    expect(normalizeRichPreview(p, { ...fixture, is_delete: true })).toBeNull();
  });
  it('preserves GitHub source attribution and shows only finite metrics', () => {
    const p = link('github.com/org/repo');
    const result = normalizeRichPreview(p, { html_url: p.url, full_name: 'org/repo', stargazers_count: 42, forks_count: NaN, owner: { avatar_url: 'javascript:bad' } })!;
    expect(result.rich.metrics).toEqual([{ kind: 'stars', value: 42 }]);
    expect(result.image).toBeNull();
    expect(normalizeRichPreview(p, { html_url: 'https://attacker.org/repo', full_name: 'org/repo' })).toBeNull();
  });
  it('does not claim an ENS profile resolves when the address is missing', () => {
    const p = link('vitalik.eth');
    expect(normalizeRichPreview(p, { address: '0x' + '0'.repeat(40) })).toBeNull();
    expect(normalizeRichPreview(p, { address: '0x' + '1'.repeat(40), description: 'Bio' })?.rich.identifier).toBe('0x' + '1'.repeat(40));
  });
  it('never embeds IPFS HTML/SVG or oversized images', () => {
    const p = link('ipfs://' + cid + '/test.png');
    expect(normalizeRichPreview(p, { available: true, type: 'image/png', size: 100 })?.image).toBe(p.url);
    for (const data of [{ type: 'text/html', size: 100 }, { type: 'image/svg+xml', size: 100 }, { type: 'image/png', size: 20_000_000 }, { type: 'image/png', size: null }]) {
      expect(normalizeRichPreview(p, { available: true, ...data })?.image).toBeNull();
    }
  });
});

describe('bounded public fetches', () => {
  it('deduplicates concurrent loads and caches successful previews', async () => {
    const fetch = jest.fn(async (_url?: unknown, _init?: unknown) => reply(123));
    globalThis.fetch = fetch;
    const p = link('https://defillama.com/protocol/cache-fixture');
    const [a, b] = await Promise.all([fetchRichPreview(p), fetchRichPreview(p)]);
    expect(a).toBe(b);
    await fetchRichPreview(p);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.llama.fi/tvl/cache-fixture');
  });
  it('caches rate-limit failures without retries and keeps the source link', async () => {
    const fetch = jest.fn(async (_url?: unknown, _init?: unknown) => ({ ok: false }) as Response);
    globalThis.fetch = fetch;
    const p = link('github.com/org/rate-limit-fixture');
    const result = await fetchRichPreview(p);
    expect(result.url).toBe(p.url);
    expect(result.rich.fetchedAt).toBeNull();
    await fetchRichPreview(p);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('reads only HEAD for IPFS previews and sends no credentials', async () => {
    const fetch = jest.fn(async (_url?: unknown, _init?: unknown) => ({ ok: true, headers: new Headers({ 'content-type': 'image/png', 'content-length': '150' }) }) as Response);
    globalThis.fetch = fetch;
    const p = link('ipfs://' + cid + '/head-only.png');
    const result = await fetchRichPreview(p);
    expect(result.image).toBe(p.url);
    expect(fetch).toHaveBeenCalledWith(p.url, expect.objectContaining({ method: 'HEAD', credentials: 'omit', referrerPolicy: 'no-referrer' }));
  });
});

