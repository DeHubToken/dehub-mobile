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

export interface ConverterSource {
  id: string;
  label: string;
  /** Registrable domains. Matched on a label boundary, never as a substring. */
  domains: string[];
}

export const CONVERTER_SOURCES: ConverterSource[] = [
  { id: 'youtube', label: 'YouTube', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { id: 'tiktok', label: 'TikTok', domains: ['tiktok.com'] },
  { id: 'instagram', label: 'Instagram', domains: ['instagram.com'] },
  { id: 'twitter', label: 'X', domains: ['x.com', 'twitter.com'] },
  { id: 'facebook', label: 'Facebook', domains: ['facebook.com', 'fb.watch'] },
  { id: 'twitch', label: 'Twitch', domains: ['twitch.tv'] },
  { id: 'kick', label: 'Kick', domains: ['kick.com'] },
  { id: 'rumble', label: 'Rumble', domains: ['rumble.com'] },
  { id: 'vimeo', label: 'Vimeo', domains: ['vimeo.com'] },
  { id: 'dailymotion', label: 'Dailymotion', domains: ['dailymotion.com', 'dai.ly'] },
  { id: 'reddit', label: 'Reddit', domains: ['reddit.com', 'redd.it'] },
  { id: 'bluesky', label: 'Bluesky', domains: ['bsky.app'] },
  { id: 'odysee', label: 'Odysee', domains: ['odysee.com'] },
  { id: 'streamable', label: 'Streamable', domains: ['streamable.com'] },
  { id: 'loom', label: 'Loom', domains: ['loom.com'] },
  { id: 'tumblr', label: 'Tumblr', domains: ['tumblr.com'] },
  { id: 'pinterest', label: 'Pinterest', domains: ['pinterest.com', 'pin.it'] },
  { id: 'snapchat', label: 'Snapchat', domains: ['snapchat.com'] },
  { id: 'vk', label: 'VK', domains: ['vk.com'] },
  { id: 'rutube', label: 'Rutube', domains: ['rutube.ru'] },
  { id: 'bilibili', label: 'Bilibili', domains: ['bilibili.com'] },
];

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
