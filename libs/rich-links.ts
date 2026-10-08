/** Read-only public share cards. Keep in sync with mobile libs/rich-links.ts. */
import { ensNamehash } from './ens-hash';

export type RichProvider = 'snapshot' | 'audius' | 'defillama' | 'github' | 'ens' | 'ipfs';
export interface RichLink {
  provider: RichProvider;
  url: string;
  id: string;
  kind?: string;
  space?: string;
}
export interface RichDetails {
  provider: RichProvider;
  fetchedAt: number | null;
  status?: 'open' | 'closed' | 'pending' | 'active' | 'locked';
  metrics: { kind: 'stars' | 'forks' | 'tvl' | 'duration' | 'tracks' | 'power'; value: number }[];
  choices?: { label: string; score: number; share: number }[];
  totalChoices?: number;
  endsAt?: number;
  identifier?: string;
  audioUrl?: string;
}
export interface RichPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  rich: RichDetails;
}
const names: Record<RichProvider, string> = { snapshot: 'Snapshot', audius: 'Audius', defillama: 'DefiLlama', github: 'GitHub', ens: 'ENS', ipfs: 'IPFS' };
const SLUG = /^[a-zA-Z0-9_.-]{1,180}$/;
const ENS = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.eth$/i;
const CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/;
const GATEWAYS = new Set(['ipfs.io', 'dweb.link', 'gateway.pinata.cloud', 'cloudflare-ipfs.com']);
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown, limit = 500): string => typeof v === 'string' ? v.slice(0, limit) : '';
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Only public HTTPS media, never executable URLs, credentials, or private hosts. */
export function publicMediaUrl(value: unknown): string | null {
  try {
    const u = new URL(str(value, 2048));
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !host.includes('.') ||
        /^[\d.]+$/.test(host) || host.includes(':') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    return u.href;
  } catch { return null; }
}
function ipfsLink(id: string, path: string): RichLink | null {
  if (!CID.test(id) || path.length > 1000) return null;
  try {
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (segments.some(s => s === '.' || s === '..' || /[\\/\x00-\x1f]/.test(s))) return null;
    const suffix = segments.length ? '/' + segments.map(encodeURIComponent).join('/') : '';
    return { provider: 'ipfs', id, kind: segments.at(-1), url: 'https://ipfs.io/ipfs/' + id + suffix };
  } catch { return null; }
}

export function parseRichLink(input: string): RichLink | null {
  const raw = input.trim();
  if (ENS.test(raw)) {
    const id = raw.toLowerCase();
    return { provider: 'ens', id, url: 'https://app.ens.domains/' + id };
  }
  const ipfs = /^ipfs:\/\/([^/?#]+)([^?#]*)/i.exec(raw);
  if (ipfs) return ipfsLink(ipfs[1], ipfs[2]);
  try {
    // Reject path traversal before URL normalizes it away.
    if (/(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/i.test(raw) || raw.includes('\\')) return null;
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const p = u.pathname.split('/').filter(Boolean);
    if (GATEWAYS.has(host) && p[0] === 'ipfs' && p[1]) return ipfsLink(p[1], p.slice(2).join('/'));
    const sub = /^([a-z2-7]+)\.ipfs\.dweb\.link$/.exec(host);
    if (sub) return ipfsLink(sub[1], p.join('/'));
    if (host === 'app.ens.domains') {
      const id = p[0] === 'name' ? p[1] : p[0];
      if (id && ENS.test(id) && p.length <= (p[0] === 'name' ? 3 : 2)) return parseRichLink(id);
    }
    if (ENS.test(host) && !p.length && !u.search && !u.hash) return parseRichLink(host);
    if (host === 'snapshot.org' || host === 'snapshot.box') {
      const route = u.hash.startsWith('#/') ? u.hash.slice(2).split('/') : p;
      // The newer Snapshot UI prefixes legacy off-chain spaces with s:.
      const space = route[0]?.replace(/^s:/, '');
      const id = route[2];
      if (space && SLUG.test(space) && route[1] === 'proposal' && route.length === 3 &&
          (/^0x[a-fA-F0-9]{64}$/.test(id) || CID.test(id))) {
        return { provider: 'snapshot', space, id, url: 'https://snapshot.org/#/' + space + '/proposal/' + id };
      }
    }
    if (!p.every(part => SLUG.test(part) && part !== '.' && part !== '..')) return null;
    if (host === 'defillama.com' && p[0] === 'protocol' && p.length === 2) {
      return { provider: 'defillama', id: p[1].toLowerCase(), url: 'https://defillama.com/protocol/' + p[1].toLowerCase() };
    }
    if (host === 'audius.co' && ((p.length === 2 && !['search', 'explore', 'settings', 'embed'].includes(p[0])) ||
        (p.length === 3 && ['playlist', 'album'].includes(p[1])))) {
      return { provider: 'audius', id: p.join('/'), kind: p.length === 3 ? 'playlist' : 'track', url: 'https://audius.co/' + p.join('/') };
    }
    if (host === 'github.com' && p.length >= 2 && /^[a-zA-Z0-9-]+$/.test(p[0])) {
      const repo = p[0] + '/' + p[1].replace(/\.git$/, '');
      if (p.length === 2) return { provider: 'github', id: repo, kind: 'repo', url: 'https://github.com/' + repo };
      if (p.length === 4 && ['issues', 'pull'].includes(p[2]) && /^[1-9]\d{0,9}$/.test(p[3])) {
        return { provider: 'github', id: repo + '/' + (p[2] === 'pull' ? 'pulls' : 'issues') + '/' + p[3], kind: p[2], url: 'https://github.com/' + p.join('/') };
      }
      if (p.length === 4 && p[2] === 'releases' && p[3] === 'latest') {
        return { provider: 'github', id: repo + '/releases/latest', kind: 'release', url: 'https://github.com/' + p.join('/') };
      }
      if (p.length === 5 && p[2] === 'releases' && p[3] === 'tag') {
        return { provider: 'github', id: repo + '/releases/tags/' + p[4], kind: 'release', url: 'https://github.com/' + p.join('/') };
      }
    }
  } catch { /* Ordinary outside link. */ }
  return null;
}

/** Preserve text order and match whole tokens, never an email or a suffix of a spoofed URL. */
export function extractShareUrls(text: string): string[] {
  const found: string[] = [];
  for (const token of text.split(/[\s<>]+/)) {
    const value = token.replace(/^[("'\[]+/, '').replace(/[.,;:!?)}\]"']+$/, '');
    if (!value || value.includes('@')) continue;
    const rich = parseRichLink(value);
    if (rich) { found.push(rich.url); continue; }
    if (/^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?\/[^\s<>\u0080-\uFFFF]*$/.test(value)) {
      found.push(/^https?:\/\//i.test(value) ? value : 'https://' + value);
    }
  }
  return [...new Set(found)].slice(0, 8);
}

function fallback(link: RichLink): RichPreview {
  return {
    url: link.url, title: link.provider === 'ipfs' ? link.kind || link.id : link.id,
    description: '', image: null, siteName: names[link.provider],
    rich: { provider: link.provider, fetchedAt: null, metrics: [], ...(link.provider === 'ipfs' ? { identifier: link.id } : {}) },
  };
}
function metric(kind: RichDetails['metrics'][number]['kind'], value: unknown): RichDetails['metrics'] {
  const n = num(value);
  return n === null ? [] : [{ kind, value: n }];
}

export function normalizeRichPreview(link: RichLink, value: unknown, now = Date.now()): RichPreview | null {
  const d = object(value);
  const result = fallback(link);
  result.rich.fetchedAt = now;
  if (link.provider === 'snapshot') {
    if (d.id !== link.id || object(d.space).id !== link.space || !str(d.title)) return null;
    result.title = str(d.title);
    result.description = str(object(d.space).name) || link.space || '';
    result.rich.status = d.state === 'active' ? 'active' : d.state === 'pending' ? 'pending' : d.state === 'closed' ? 'closed' : undefined;
    const choices = Array.isArray(d.choices) ? d.choices : [];
    const scores = Array.isArray(d.scores) ? d.scores : [];
    const total = scores.reduce<number>((sum, score) => sum + (num(score) ?? 0), 0);
    result.rich.choices = choices.slice(0, 4).flatMap((label, i) => {
      const score = num(scores[i]);
      return typeof label === 'string' && score !== null ? [{ label: label.slice(0, 200), score, share: total > 0 ? score / total : 0 }] : [];
    });
    result.rich.totalChoices = choices.length;
    result.rich.metrics = metric('power', d.scores_total);
    const end = num(d.end);
    if (end && end < 8640000000000) result.rich.endsAt = end * 1000;
  } else if (link.provider === 'github') {
    const source = publicMediaUrl(d.html_url);
    // GitHub can redirect renamed repositories; only accept GitHub's own canonical result.
    if (!source || new URL(source).hostname !== 'github.com' || !str(d.full_name || d.title || d.name || d.tag_name)) return null;
    result.url = source;
    result.title = str(d.full_name || d.title || d.name || d.tag_name);
    result.description = str(d.description || d.body).replace(/[#*`]/g, '');
    result.image = publicMediaUrl(object(d.owner).avatar_url || object(d.user).avatar_url || object(d.author).avatar_url);
    result.rich.status = d.state === 'open' ? 'open' : d.state === 'closed' ? 'closed' : undefined;
    result.rich.metrics = [...metric('stars', d.stargazers_count), ...metric('forks', d.forks_count)];
    if (link.kind === 'release') result.rich.identifier = str(d.tag_name, 100);
  } else if (link.provider === 'defillama') {
    if (num(value) === null) return null;
    result.title = link.id.replace(/-/g, ' ');
    result.rich.metrics = metric('tvl', value);
  } else if (link.provider === 'audius') {
    if (!str(d.id) || !str(d.title || d.playlist_name) || d.is_delete === true || d.is_unlisted === true || d.is_available === false) return null;
    result.title = str(d.title || d.playlist_name);
    result.description = [str(object(d.user).name, 100), str(d.genre, 80)].filter(Boolean).join(' · ');
    result.image = publicMediaUrl(object(d.artwork)['480x480']);
    result.rich.metrics = link.kind === 'playlist' ? metric('tracks', d.track_count) : metric('duration', d.duration);
    const authorities = d.access_authorities;
    const publicTrack = link.kind === 'track' && d.is_streamable === true && d.is_stream_gated === false &&
      object(d.access).stream === true && !d.stream_conditions && (authorities == null || (Array.isArray(authorities) && authorities.length === 0));
    if (publicTrack && /^[a-zA-Z0-9]+$/.test(str(d.id))) {
      result.rich.audioUrl = 'https://api.audius.co/v1/tracks/' + d.id + '/stream?app_name=DeHub';
    } else if (link.kind === 'track') result.rich.status = 'locked';
  } else if (link.provider === 'ens') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(str(d.address)) || /^0x0{40}$/i.test(str(d.address))) return null;
    result.rich.identifier = str(d.address);
    result.description = str(d.description);
    result.image = publicMediaUrl(d.avatar);
  } else if (link.provider === 'ipfs') {
    if (d.available !== true) return null;
    const type = str(d.type, 100).split(';')[0];
    result.description = type;
    // Render raster media only, never HTML/SVG or an unbounded media preload.
    if (num(d.size) !== null && Number(d.size) <= 10_000_000 && /^image\/(?:png|jpeg|gif|webp)$/.test(type)) result.image = link.url;
    if (/^audio\/(?:mpeg|mp4|ogg|wav|x-wav|webm)$/.test(type)) result.rich.audioUrl = link.url;
  }
  return result;
}

async function request(url: string, signal: AbortSignal, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Preview unavailable');
  return response;
}
async function json(url: string, signal: AbortSignal, init?: RequestInit): Promise<unknown> {
  const response = await request(url, signal, init);
  if (Number(response.headers.get('content-length')) > 1_000_000) throw new Error('Preview too large');
  const body = await response.text();
  if (body.length > 1_000_000) throw new Error('Preview too large');
  return JSON.parse(body);
}
async function ensRecords(name: string, signal: AbortSignal): Promise<unknown> {
  const node = (await ensNamehash(name)).slice(2);
  const call = async (to: string, data: string): Promise<string> => {
    const response = object(await json('https://ethereum-rpc.publicnode.com', signal, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    }));
    if (response.error || !/^0x[0-9a-fA-F]*$/.test(str(response.result, 10000))) throw new Error('ENS unavailable');
    return str(response.result, 10000);
  };
  const resolverWord = await call('0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', '0x0178b8bf' + node);
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(resolverWord) || /^0x0+$/.test(resolverWord)) return null;
  const resolver = '0x' + resolverWord.slice(-40);
  const addressWord = await call(resolver, '0x3b3b57de' + node);
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(addressWord)) return null;
  const readText = async (key: string): Promise<string> => {
    try {
      const keyHex = Array.from(key).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      const data = '0x59d1d43c' + node + (64).toString(16).padStart(64, '0') +
        key.length.toString(16).padStart(64, '0') + keyHex.padEnd(64, '0');
      const raw = (await call(resolver, data)).slice(2);
      const offset = parseInt(raw.slice(0, 64), 16) * 2;
      const length = parseInt(raw.slice(offset, offset + 64), 16);
      if (!Number.isFinite(length) || length > 2048 || offset !== 64 || raw.length < offset + 64 + length * 2) return '';
      const bytes = raw.slice(offset + 64, offset + 64 + length * 2).match(/../g) || [];
      return decodeURIComponent(bytes.map(b => '%' + b).join(''));
    } catch { return ''; }
  };
  const [description, avatar] = await Promise.all([readText('description'), readText('avatar')]);
  return { address: '0x' + addressWord.slice(-40), description, avatar };
}
async function load(link: RichLink, signal: AbortSignal): Promise<unknown> {
  switch (link.provider) {
    case 'snapshot': {
      const data = object(await json('https://hub.snapshot.org/graphql', signal, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query ShareProposal($id: String!) { proposal(id: $id) { id title choices scores scores_total state end space { id name } } }', variables: { id: link.id } }),
      }));
      return object(data.data).proposal;
    }
    case 'github': return json('https://api.github.com/repos/' + link.id, signal, { headers: { Accept: 'application/vnd.github+json' } });
    case 'defillama': return json('https://api.llama.fi/tvl/' + encodeURIComponent(link.id), signal);
    case 'audius': return object(await json('https://api.audius.co/v1/resolve?app_name=DeHub&url=' + encodeURIComponent(link.url), signal)).data;
    case 'ens': return ensRecords(link.id, signal);
    case 'ipfs': {
      const response = await request(link.url, signal, { method: 'HEAD' });
      const size = response.headers.get('content-length');
      return { available: true, type: response.headers.get('content-type'), size: size ? Number(size) : null };
    }
  }
}

const cache = new Map<string, { until: number; value: RichPreview }>();
const pending = new Map<string, Promise<RichPreview>>();
export function fetchRichPreview(link: RichLink): Promise<RichPreview> {
  const cached = cache.get(link.url);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
  const existing = pending.get(link.url);
  if (existing) return existing;
  const task = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let value = fallback(link);
    try { value = normalizeRichPreview(link, await load(link, controller.signal)) || value; } catch { /* Keep the source link usable. */ }
    finally { clearTimeout(timer); }
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(link.url, { until: Date.now() + (value.rich.fetchedAt ? 300_000 : 60_000), value });
    return value;
  })();
  pending.set(link.url, task);
  void task.finally(() => pending.delete(link.url));
  return task;
}

