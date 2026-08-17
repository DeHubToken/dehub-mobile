/**
 * DeHub Entity Links
 * ==================
 * One parser for every DeHub URL that deserves to render as a card instead of
 * as a link: posts, profiles, communities, community invites, stores, store
 * listings and events. The web app has the same module at `src/lib/dehub-links.ts`
 * — keep the two in step, because a link built on one client is read on the other.
 *
 * Before this, mobile recognised exactly one shape: `/post/<id>` in a DM, matched
 * by a regex living inside MessageBubble. Everything else — a shop item, a
 * community, an event — arrived as a bare URL in every surface of the app.
 *
 * Two rules worth keeping:
 *
 * 1. **Host is checked.** Only our own hosts (and host-less paths, which can
 *    only be ours) get a card. A card is a claim that the content is DeHub's.
 * 2. **The link is kept.** `path` is the URL as written, so a link carrying a
 *    query string still resolves to the thing it pointed at.
 */

import env from '../config/env';

export type DehubLinkKind =
  | 'post'
  | 'profile'
  | 'community'
  | 'communityInvite'
  | 'store'
  | 'listing'
  | 'event'
  | 'stage';

export interface DehubLinkMatch {
  kind: DehubLinkKind;
  /** The exact substring matched in the source text — strip by this. */
  raw: string;
  /** Path + query exactly as the link pointed. */
  path: string;
  tokenId?: string;
  username?: string;
  slug?: string;
  code?: string;
  storeId?: string;
  listingId?: string;
  eventNumber?: string;
  stageId?: string;
  /** Set when the link used the short form (/stages/7) instead of the uuid. */
  stageShortId?: string;
}

// ── Hosts ───────────────────────────────────────────────────────────────────

function isDehubHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h === 'dehub.io' || h.endsWith('.dehub.io')) return true;
  if (h === 'dehub.app' || h.endsWith('.dehub.app')) return true;
  if (h === 'dehub.net' || h.endsWith('.dehub.net')) return true;
  if (h.endsWith('.pages.dev') || h.endsWith('.workers.dev')) return true;
  return false;
}

/**
 * Single-segment paths that belong to a route, not to a person. `/:username`
 * is the catch-all on web, so without this every product page would parse as a
 * profile that does not exist.
 */
const RESERVED_ROOT_SEGMENTS = new Set([
  'app', 'admin', 'affiliate', 'agents', 'arcade', 'assistant', 'auth', 'blog',
  'bridge', 'communities', 'connect', 'creator', 'creators', 'delete-account',
  'docs', 'dpay', 'editor', 'events', 'explore', 'features', 'governance',
  'guide', 'guides', 'jobs', 'launchpad', 'leaderboard', 'mcp', 'mobile-preview',
  'music', 'premium', 'pricing', 'prompt', 'r', 'radio', 'robots.txt', 'shorts',
  'sitemap.xml', 'skill.md', 'stage', 'stages', 'stake', 'stats', 'stores',
  'top-100', 'tv', 'videos', 'work',
]);

// ── Tokenising ──────────────────────────────────────────────────────────────

const ABSOLUTE_URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s<>"'`]*/gi;
// `stage` sits alongside the /app prefix rather than under it because web's
// invite route is top-level — /stage/:id, not /app/stage/:id. The optional `s`
// also admits the short share form, /stages/7.
const BARE_PATH_RE = /\/(?:app|communities|stages?)\/[^\s<>"'`]*/gi;
const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}>"']+$/;

function trimTrailingPunctuation(token: string): string {
  let out = token;
  for (;;) {
    const trimmed = out.replace(TRAILING_PUNCTUATION_RE, '');
    if (trimmed === out) return out;
    out = trimmed;
  }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/** Split a URL into host / pathname / search without relying on the URL class. */
function splitUrl(raw: string): { host: string | null; pathname: string; search: string } | null {
  const withoutScheme = raw.replace(/^https?:\/\//i, '');
  const hashIndex = withoutScheme.indexOf('#');
  const noFragment = hashIndex >= 0 ? withoutScheme.slice(0, hashIndex) : withoutScheme;

  if (raw.startsWith('/')) {
    const [p, q = ''] = noFragment.split('?');
    return { host: null, pathname: p, search: q };
  }

  const slash = noFragment.indexOf('/');
  if (slash < 0) return null;
  const host = noFragment.slice(0, slash);
  const rest = noFragment.slice(slash);
  const [p, q = ''] = rest.split('?');
  return { host, pathname: p, search: q };
}

function queryParam(search: string, key: string): string | null {
  for (const pair of search.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (decodeURIComponent(pair.slice(0, eq)) === key) {
      try {
        return decodeURIComponent(pair.slice(eq + 1));
      } catch {
        return pair.slice(eq + 1);
      }
    }
  }
  return null;
}

/** Parse a single URL (or bare path) into the entity it points at. */
export function parseDehubLink(input: string): DehubLinkMatch | null {
  if (!input) return null;
  const raw = trimTrailingPunctuation(input.trim());
  if (!raw) return null;

  const parts = splitUrl(raw);
  if (!parts) return null;
  if (parts.host && !isDehubHost(parts.host)) return null;

  const segments = parts.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const path = `${parts.pathname}${parts.search ? `?${parts.search}` : ''}`;
  const base = { raw, path } as const;

  // Both /app/communities/… and /communities/… are live web routes.
  const isAppScoped = segments[0] === 'app';
  const scoped = isAppScoped ? segments.slice(1) : segments;

  // ── post ──
  if (isAppScoped && (scoped[0] === 'post' || scoped[0] === 'video') && scoped[1]) {
    if (!/^\d+$/.test(scoped[1])) return null;
    return { ...base, kind: 'post', tokenId: scoped[1] };
  }

  // ── community invite (before the slug form, or ':slug' swallows 'join') ──
  if (scoped[0] === 'communities' && scoped[1] === 'join' && scoped[2]) {
    return { ...base, kind: 'communityInvite', code: scoped[2] };
  }

  // ── community ──
  if (scoped[0] === 'communities' && scoped[1]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(scoped[1])) return null;
    return { ...base, kind: 'community', slug: scoped[1] };
  }

  // ── store / listing ──
  if (isAppScoped && scoped[0] === 'stores' && scoped[1]) {
    const storeId = scoped[1];
    if (!/^[a-fA-F0-9-]{8,}$/.test(storeId)) return null;
    const listingId = queryParam(parts.search, 'listing');
    if (listingId && /^[a-fA-F0-9-]{8,}$/.test(listingId)) {
      return { ...base, kind: 'listing', storeId, listingId };
    }
    return { ...base, kind: 'store', storeId };
  }

  // ── event ──
  if (isAppScoped && scoped[0] === 'events' && scoped[1]) {
    if (!/^\d+$/.test(scoped[1])) return null;
    return { ...base, kind: 'event', eventNumber: scoped[1] };
  }

  // ── stage — the invite / announcement link ──
  //
  // Deliberately not app-scoped: web's route is top-level. Accepted either way
  // so a hand-typed /app/stage/... still cards up rather than falling through.
  if (scoped[0] === 'stage' && scoped[1]) {
    if (!/^[a-fA-F0-9-]{8,}$/.test(scoped[1])) return null;
    return { ...base, kind: 'stage', stageId: scoped[1] };
  }

  // ── /stages/:n — the short share form of the same link ──
  //
  // Web's share sheet prefers this form whenever the row has a short_id, so it
  // is the shape most stage links in the wild now use. Only the numeric shape:
  // bare /stages is the hub page, and anything else under it has no route.
  if (scoped[0] === 'stages' && scoped[1]) {
    if (!/^\d+$/.test(scoped[1])) return null;
    return { ...base, kind: 'stage', stageShortId: scoped[1] };
  }

  // ── profile ──
  //
  // Host-qualified links only: a bare "/foo" in a sentence is far more likely
  // to be somebody typing a path than a profile link.
  if (parts.host && segments.length === 1) {
    const raw0 = segments[0];
    let username: string;
    try {
      username = decodeURIComponent(raw0).replace(/^@/, '');
    } catch {
      username = raw0.replace(/^@/, '');
    }
    if (!username || RESERVED_ROOT_SEGMENTS.has(username.toLowerCase())) return null;
    if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(username)) return null;
    return { ...base, kind: 'profile', username };
  }

  return null;
}

// ── Scanning free text ──────────────────────────────────────────────────────

/** Every DeHub entity link in a block of text, in the order they appear. */
export function findDehubLinks(text?: string | null): DehubLinkMatch[] {
  if (!text) return [];

  const matches: DehubLinkMatch[] = [];
  const claimed: Array<[number, number]> = [];
  const isClaimed = (start: number) => claimed.some(([s, e]) => start >= s && start < e);

  // Pass 1 — whole URLs. The range is claimed whether or not it parsed, which
  // is the point: a URL on somebody else's host has already been judged, and
  // rule 1 above only holds if the bare-path pass cannot then match the
  // `/app/post/1` sitting inside `https://example.com/app/post/1` and card it
  // as ours. Claiming only successes let exactly that through.
  ABSOLUTE_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ABSOLUTE_URL_RE.exec(text)) !== null) {
    if (isClaimed(m.index)) continue;
    const parsed = parseDehubLink(m[0]);
    if (parsed) matches.push(parsed);
    claimed.push([m.index, m.index + m[0].length]);
  }

  // Pass 2 — bare in-app paths, which can only be ours. Anything inside a URL
  // pass 1 already saw is skipped.
  BARE_PATH_RE.lastIndex = 0;
  while ((m = BARE_PATH_RE.exec(text)) !== null) {
    if (isClaimed(m.index)) continue;
    const parsed = parseDehubLink(m[0]);
    if (parsed) {
      matches.push(parsed);
      claimed.push([m.index, m.index + parsed.raw.length]);
    }
  }

  return matches.sort((a, b) => text.indexOf(a.raw) - text.indexOf(b.raw));
}

/** The first DeHub entity link in a block of text, if any. */
export function findDehubLink(text?: string | null): DehubLinkMatch | null {
  return findDehubLinks(text)[0] ?? null;
}

export function hasDehubLink(text?: string | null): boolean {
  return findDehubLinks(text).length > 0;
}

/**
 * Remove matched URLs from text for display, because a card replaced them.
 * Display only — never send the result back to an API.
 */
export function stripDehubLinkMatches(
  text: string | null | undefined,
  matches: DehubLinkMatch[],
): string {
  if (!text) return text ?? '';
  let out = text;
  for (const match of matches) {
    out = out.split(match.raw).join('');
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove every DeHub entity URL from text for display. */
export function stripDehubLinks(text?: string | null): string {
  if (!text) return text ?? '';
  return stripDehubLinkMatches(text, findDehubLinks(text));
}

/** Human label for a link kind — used by share sheets and fallback chips. */
export function dehubLinkLabel(kind: DehubLinkKind): string {
  switch (kind) {
    case 'post': return 'post';
    case 'profile': return 'profile';
    case 'community': return 'community';
    case 'communityInvite': return 'community invite';
    case 'store': return 'store';
    case 'listing': return 'item';
    case 'event': return 'event';
    case 'stage': return 'stage';
    default: return 'link';
  }
}

/** Share origin — the same host the web app builds links on. */
export const SHARE_ORIGIN = (env.APP_ORIGIN || 'https://dehub.io').replace(/\/+$/, '');
