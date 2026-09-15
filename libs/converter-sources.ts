/**
 * Where /converter accepts links from.
 * ====================================
 *
 * A mirror of the backend's `import-sources.ts` (and of the web app's copy at
 * `src/lib/converter-sources.ts`), and deliberately only a
 * mirror: the server re-detects every URL and answers a link it does not
 * recognise with a 400 naming the whole list. Nothing here is a security
 * boundary. It exists so pasting a Spotify link is answered in the input
 * rather than after a round trip, and so the client can say what it takes
 * without asking the API.
 *
 * If the two drift, the server wins and the only symptom is a link the client
 * waves through and the API then refuses — a worse message, not a wrong
 * outcome. Keep them in step anyway.
 */

/**
 * What one import publishes as.
 *
 * All three are real post types the composer has always produced — video,
 * `feed-audio` and `feed-images`. The fetchers differ on the server: yt-dlp
 * does video and audio, and pictures come from a self-hosted cobalt, because
 * yt-dlp answers a photo post with "No video could be found".
 */
export type MediaKind = 'video' | 'audio' | 'image';

export interface ConverterSource {
  id: string;
  label: string;
  /** Registrable domains. Matched on a label boundary, never as a substring. */
  domains: string[];
  /** What this source can publish as, best-first — the head is the default.
   * Mirrors the backend registry; the server re-checks and refuses anything
   * that does not line up. */
  media: MediaKind[];
}

export const CONVERTER_SOURCES: ConverterSource[] = [
  { id: 'youtube', label: 'YouTube', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], media: ['video', 'audio'] },
  { id: 'tiktok', label: 'TikTok', domains: ['tiktok.com'], media: ['video', 'audio', 'image'] },
  { id: 'instagram', label: 'Instagram', domains: ['instagram.com'], media: ['video', 'audio', 'image'] },
  { id: 'twitter', label: 'X', domains: ['x.com', 'twitter.com'], media: ['video', 'audio', 'image'] },
  { id: 'facebook', label: 'Facebook', domains: ['facebook.com', 'fb.watch'], media: ['video', 'audio'] },
  { id: 'twitch', label: 'Twitch', domains: ['twitch.tv'], media: ['video', 'audio'] },
  { id: 'kick', label: 'Kick', domains: ['kick.com'], media: ['video', 'audio'] },
  { id: 'rumble', label: 'Rumble', domains: ['rumble.com'], media: ['video', 'audio'] },
  { id: 'vimeo', label: 'Vimeo', domains: ['vimeo.com'], media: ['video', 'audio'] },
  { id: 'dailymotion', label: 'Dailymotion', domains: ['dailymotion.com', 'dai.ly'], media: ['video', 'audio'] },
  { id: 'reddit', label: 'Reddit', domains: ['reddit.com', 'redd.it'], media: ['video', 'audio', 'image'] },
  { id: 'bluesky', label: 'Bluesky', domains: ['bsky.app'], media: ['video', 'audio', 'image'] },
  { id: 'odysee', label: 'Odysee', domains: ['odysee.com'], media: ['video', 'audio'] },
  { id: 'streamable', label: 'Streamable', domains: ['streamable.com'], media: ['video', 'audio'] },
  { id: 'loom', label: 'Loom', domains: ['loom.com'], media: ['video', 'audio'] },
  { id: 'tumblr', label: 'Tumblr', domains: ['tumblr.com'], media: ['video', 'audio', 'image'] },
  { id: 'pinterest', label: 'Pinterest', domains: ['pinterest.com', 'pin.it'], media: ['image', 'video', 'audio'] },
  { id: 'snapchat', label: 'Snapchat', domains: ['snapchat.com'], media: ['video', 'audio', 'image'] },
  { id: 'vk', label: 'VK', domains: ['vk.com'], media: ['video', 'audio'] },
  { id: 'rutube', label: 'Rutube', domains: ['rutube.ru'], media: ['video', 'audio'] },
  { id: 'bilibili', label: 'Bilibili', domains: ['bilibili.com'], media: ['video', 'audio'] },
  { id: 'soundcloud', label: 'SoundCloud', domains: ['soundcloud.com', 'snd.sc'], media: ['audio'] },
  { id: 'bandcamp', label: 'Bandcamp', domains: ['bandcamp.com'], media: ['audio'] },
  { id: 'mixcloud', label: 'Mixcloud', domains: ['mixcloud.com'], media: ['audio'] },
];

/** Whether this source can publish as `kind`. */
export function sourceSupports(source: ConverterSource, kind: MediaKind): boolean {
  return source.media.includes(kind);
}

/** What a paste defaults to — the head of the source's list. Pinterest is a
 * picture board, so it leads with pictures; everything else leads with video. */
export function defaultMediaKind(source: ConverterSource): MediaKind {
  return source.media[0];
}

const BY_DOMAIN = new Map<string, ConverterSource>();
for (const source of CONVERTER_SOURCES) {
  for (const domain of source.domains) BY_DOMAIN.set(domain, source);
}

/**
 * Which source a pasted link belongs to, or null.
 *
 * Walks up the host's labels rather than testing `includes`, so
 * `youtube.com.example.test` is not a YouTube link. The scheme check keeps
 * `javascript:` and friends out of a value the page is about to echo.
 */
export function detectConverterSource(rawUrl: string): ConverterSource | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const exact = BY_DOMAIN.get(host);
  if (exact) return exact;

  for (let dot = host.indexOf('.'); dot !== -1; dot = host.indexOf('.', dot + 1)) {
    const parent = BY_DOMAIN.get(host.slice(dot + 1));
    if (parent) return parent;
  }

  return null;
}

/** The list as a sentence: "YouTube, TikTok, Instagram…". Used in the empty
 * state and in the error a bad paste gets. */
export function converterSourceList(): string {
  return CONVERTER_SOURCES.map(source => source.label).join(', ');
}
