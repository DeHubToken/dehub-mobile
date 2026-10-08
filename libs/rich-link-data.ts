import { ensNamehash } from './ens-hash';
import { publicMediaUrl, type RichProvider, type RichLink, type RichDetails, type RichPreview } from './rich-links';
const names: Record<RichProvider, string> = { snapshot: 'Snapshot', audius: 'Audius', defillama: 'DefiLlama', github: 'GitHub', ens: 'ENS', ipfs: 'IPFS' };
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown, limit = 500): string => typeof v === 'string' ? v.slice(0, limit) : '';
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

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
