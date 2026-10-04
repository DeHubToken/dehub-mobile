/**
 * Social link normalisation
 * =========================
 * Profile socials are stored as whatever the user typed — usually a bare
 * `youtube.com/name`, no scheme. Rendering that verbatim is mostly fine, but
 * YouTube retired bare custom URLs: `youtube.com/lcs_game` now 404s while
 * `youtube.com/@lcs_game` resolves to the same channel. Every profile saved
 * before that change points at a dead page.
 *
 * TikTok has the same shape — a profile is only ever `/@handle` — so a stored
 * `tiktok.com/name` is fixed the same way.
 *
 * X and Instagram still serve bare handles, so they are left alone.
 */

/** YouTube paths that are real routes rather than a channel handle. */
const YOUTUBE_RESERVED = new Set([
  'c', 'channel', 'user', 'watch', 'playlist', 'shorts', 'live',
  'embed', 'results', 'feed', 'about', 'premium', 'gaming', 'music',
]);

const SOCIAL_DOMAINS: Record<string, string[]> = {
  twitterLink: ['x.com', 'twitter.com'],
  instagramLink: ['instagram.com'],
  tiktokLink: ['tiktok.com'],
  youtubeLink: ['youtube.com', 'youtu.be'],
  facebookLink: ['facebook.com'],
  telegramLink: ['t.me', 'telegram.me'],
  discordLink: ['discord.gg', 'discord.com'],
};

function splitUrl(raw: string): { host: string; path: string; rest: string } | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return {
      host: url.hostname.replace(/^www\./i, '').toLowerCase(),
      path: url.pathname.replace(/^\/+/, '').replace(/\/+$/, ''),
      rest: `${url.search}${url.hash}`,
    };
  } catch {
    return null;
  }
}

/**
 * Rewrite a stored profile link to a form the platform still serves.
 * Anything unrecognised is returned with only a scheme added, exactly as
 * before — this must never turn a working link into a broken one.
 */
export function normalizeSocialUrl(key: string, raw: string): string {
  const value = raw.trim().replace(/^\/\//, '');
  if (!value) return '#';
  const domains = SOCIAL_DOMAINS[key];
  const host = value.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./i, '').toLowerCase();
  // A bare handle belongs to the selected platform, including handles with
  // dots. Treating it as a hostname opens https://r2r_officiel instead.
  if (domains && !/^https?:\/\//i.test(value) && !domains.includes(host) && !value.includes('/')) {
    const handle = value.replace(/^@+/, '').replace(/\s+/g, '');
    if (!handle) return '#';
    const prefix = key === 'youtubeLink' || key === 'tiktokLink' ? '@' : '';
    return `https://${domains[0]}/${prefix}${encodeURIComponent(handle)}`;
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  const parts = splitUrl(value);
  if (!parts) return withScheme;

  const { host, path, rest } = parts;
  // A path with a slash in it is already a route (channel/…, c/…), not a
  // bare handle, so it is left exactly as stored.
  if (!path || path.includes('/')) return withScheme;
  if (path.startsWith('@')) return withScheme;

  if (key === 'youtubeLink' && /(^|\.)youtube\.com$/.test(host)) {
    if (YOUTUBE_RESERVED.has(path.toLowerCase())) return withScheme;
    return `https://www.youtube.com/@${path}${rest}`;
  }

  if (key === 'tiktokLink' && /(^|\.)tiktok\.com$/.test(host)) {
    return `https://www.tiktok.com/@${path}${rest}`;
  }

  return withScheme;
}
