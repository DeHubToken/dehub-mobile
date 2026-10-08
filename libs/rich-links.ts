/** Read-only public share cards. Keep in sync with mobile libs/rich-links.ts. */

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
const SLUG = /^[a-zA-Z0-9_.-]{1,180}$/;
const ENS = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.eth$/i;
const CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/;
const GATEWAYS = new Set(['ipfs.filebase.io', 'ipfs.io', 'dweb.link', 'gateway.pinata.cloud', 'cloudflare-ipfs.com']);
const str = (v: unknown, limit = 500): string => typeof v === 'string' ? v.slice(0, limit) : '';

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
    return { provider: 'ipfs', id, kind: segments.at(-1), url: 'https://ipfs.filebase.io/ipfs/' + id + suffix };
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

/** Provider clients load only after a recognized share link is rendered. */
export async function fetchRichPreview(link: RichLink): Promise<RichPreview> {
  return (await import('./rich-link-data')).fetchRichPreview(link);
}

