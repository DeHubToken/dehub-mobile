import { WEBSITE_LINK } from '../config/links';

/** Shared artwork revision used by the website and the native disk cache. */
export const THEME_ICON_REVISION = '11';
const RASTER_THEMES = new Set([
  'system', 'minimal', 'light', 'cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'osaka', 'jungle',
  'war', 'hacker', 'island', 'horror',
]);
const PNG_KEYS = new Set([
  'boost', 'second-wind', 'comment-anchor', 'trend-jacker', 'timeline-bomber',
  'signal-flare', 'flak-jacket', 'precision-strike', 'harpoon', 'team-up', 'front-row', 'deep-current',
]);
export const THEME_ICON_KEYS = [
  'accounts', 'ads', 'arcade', 'assistant', 'audio', 'bookmarks', 'boost', 'bounties',
  'bridge', 'buy', 'careers', 'command', 'comment-anchor', 'communities', 'dao',
  'deep-current', 'email', 'events', 'features', 'flak-jacket', 'fractions', 'front-row',
  'glossary', 'governance', 'harpoon', 'home', 'images', 'live', 'lock', 'messages',
  'notifications', 'paint', 'pinned', 'posts', 'precision-strike', 'profile', 'search',
  'second-wind', 'settings', 'signal-flare', 'stages', 'staking', 'stats', 'stores',
  'subscriptions', 'superpowers', 'team-up', 'timeline-bomber', 'trend-jacker',
  'trophy', 'tv', 'usernames', 'videos', 'wand',
] as const;
export type ThemeIconKey = (typeof THEME_ICON_KEYS)[number];
const PUBLISHED_KEYS = new Set<string>(THEME_ICON_KEYS);
const ICON_ALIASES: Record<string, ThemeIconKey> = { creator: 'wand' };

/** Every supported theme owns a complete custom artwork family. */
export function themeIconUrl(theme: string, key: string): string | undefined {
  if (theme === 'immersive' || theme === 'system-light') theme = 'system';
  if (theme !== 'glass' && !RASTER_THEMES.has(theme)) return undefined;
  key = ICON_ALIASES[key] ?? key;
  if (!PUBLISHED_KEYS.has(key)) return undefined;
  if (theme === 'glass') return `${WEBSITE_LINK}/theme-icons/glass/${key}.svg?v=${THEME_ICON_REVISION}`;
  const extension = PNG_KEYS.has(key) ? 'png' : 'webp';
  return `${WEBSITE_LINK}/theme-icons/${theme}/${key}.${extension}?v=${THEME_ICON_REVISION}`;
}
