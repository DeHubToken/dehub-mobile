import { WEBSITE_LINK } from '../config/links';

/** Shared artwork revision used by the website and the native disk cache. */
export const THEME_ICON_REVISION = '7';
const RASTER_THEMES = new Set([
  'system', 'minimal', 'light', 'cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'osaka', 'jungle',
]);
const PNG_KEYS = new Set([
  'boost', 'second-wind', 'comment-anchor', 'trend-jacker', 'timeline-bomber',
  'signal-flare', 'flak-jacket', 'precision-strike', 'harpoon', 'team-up', 'front-row', 'deep-current',
]);

/** Themes without a raster family draw their own skin's glyphs. */
export function themeIconUrl(theme: string, key: string): string | undefined {
  if (!RASTER_THEMES.has(theme)) return undefined;
  const extension = PNG_KEYS.has(key) ? 'png' : 'webp';
  return `${WEBSITE_LINK}/theme-icons/${theme}/${key}.${extension}?v=${THEME_ICON_REVISION}`;
}
