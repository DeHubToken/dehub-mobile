/**
 * Spotify links
 * =============
 * Turns a pasted open.spotify.com link into something Riftn can play.
 *
 * Playback goes through Spotify's own embed player, the only route Spotify
 * leaves open to an app our size: it needs no keys, plays full songs for a
 * listener signed in to Spotify in that browser, and a 30 second preview for
 * everyone else. Their full playback SDKs are Premium-only and closed to new
 * apps without Spotify's approval.
 *
 * Keep in sync with web src/lib/spotify.ts.
 */

export type SpotifyKind = 'track' | 'album' | 'playlist' | 'episode' | 'show' | 'artist';

export interface SpotifyLink {
  kind: SpotifyKind;
  id: string;
  /** Canonical share link, the one "Open in Spotify" goes to. */
  url: string;
  /** spotify:kind:id, what the embed controller takes. */
  uri: string;
}

const KINDS = new Set<SpotifyKind>(['track', 'album', 'playlist', 'episode', 'show', 'artist']);
const ID = /^[A-Za-z0-9]{22}$/;

function build(kind: string, id: string): SpotifyLink | null {
  if (!KINDS.has(kind as SpotifyKind) || !ID.test(id)) return null;
  return {
    kind: kind as SpotifyKind,
    id,
    url: `https://open.spotify.com/${kind}/${id}`,
    uri: `spotify:${kind}:${id}`,
  };
}

/** open.spotify.com/{intl-xx/}{embed/}kind/id, or a spotify:kind:id URI. */
export function parseSpotifyLink(input: string | null | undefined): SpotifyLink | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(raw);
  if (uri) return build(uri[1], uri[2]);
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.hostname.toLowerCase() !== 'open.spotify.com' || u.username || u.password || u.port) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] && /^intl-[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0])) parts.shift();
    if (parts[0] === 'embed') parts.shift();
    if (parts.length !== 2) return null;
    return build(parts[0], parts[1]);
  } catch {
    return null;
  }
}

/** Plain iframe address, for when the controller script cannot load. */
export function spotifyEmbedUrl(link: SpotifyLink): string {
  return `https://open.spotify.com/embed/${link.kind}/${link.id}?utm_source=generator&theme=0`;
}

/** Spotify's oEmbed answers any origin (CORS *), so no proxy is needed. */
export async function fetchSpotifyOembed(link: SpotifyLink): Promise<{ title: string; image: string | null } | null> {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`);
    if (!res.ok) return null;
    const data = await res.json() as { title?: unknown; thumbnail_url?: unknown };
    const title = typeof data.title === 'string' ? data.title.slice(0, 300) : '';
    const image = typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : null;
    return title || image ? { title, image } : null;
  } catch {
    return null;
  }
}

/** "Listen to X - Album by Y | Spotify" -> "X". */
export function cleanSpotifyTitle(raw: string): string {
  return raw
    .replace(/\s*\|\s*Spotify\s*$/i, '')
    .replace(/^Listen to\s+/i, '')
    .replace(/\s+-\s+(?:album|single|ep|song|playlist|podcast|episode|compilation)\s+by\s+.+$/i, '')
    .trim();
}
