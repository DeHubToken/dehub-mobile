/**
 * Keyword filter matching — the same rule as dehubweb src/lib/keyword-filters.ts;
 * keep the two in step.
 *
 * - Case-insensitive.
 * - `wholeWord` matches the phrase between non-letter, non-digit characters,
 *   so "cat" does not catch "category" (a script with no spaces between
 *   words only matches with whole-word off — as on Mastodon).
 * - A "hide" filter wins over a "warn" one when both match.
 * - Expired filters never match, even before the server has removed them.
 */
import type { FilterContext, KeywordFilter } from '../services/keyword-filter.service';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Letters and digits in any script, where the engine can say so; Latin plus
// everything above it otherwise, which still keeps "cat" out of "category".
const NOT_WORD = (() => {
  try {
    new RegExp("\\p{L}", "u");
    return "[^\\p{L}\\p{N}_]";
  } catch {
    return "[^A-Za-z0-9_\\u00C0-\\uFFFF]";
  }
})();

const patternCache = new Map<string, RegExp>();

function patternFor(filter: Pick<KeywordFilter, 'phrase' | 'wholeWord'>): RegExp {
  const key = `${filter.wholeWord ? 'w' : 's'}:${filter.phrase}`;
  let pattern = patternCache.get(key);
  if (!pattern) {
    const phrase = escapeRegex(filter.phrase.trim()).replace(/\s+/g, '\\s+');
    pattern = filter.wholeWord
      ? new RegExp(`(^|${NOT_WORD})${phrase}(?=$|${NOT_WORD})`, 'iu')
      : new RegExp(phrase, 'iu');
    patternCache.set(key, pattern);
  }
  return pattern;
}

/** The first filter the text trips in this place, "hide" before "warn"; null when none does. */
export function matchKeywordFilter(
  texts: Array<string | null | undefined>,
  filters: KeywordFilter[] | null | undefined,
  context: FilterContext,
  now = Date.now(),
): KeywordFilter | null {
  if (!filters?.length) return null;
  const text = texts.filter(Boolean).join('\n');
  if (!text) return null;
  let warn: KeywordFilter | null = null;
  for (const filter of filters) {
    if (!filter.phrase?.trim()) continue;
    if (filter.expiresAt && Date.parse(filter.expiresAt) <= now) continue;
    if (filter.contexts?.length && !filter.contexts.includes(context)) continue;
    if (!patternFor(filter).test(text)) continue;
    if (filter.action === 'hide') return filter;
    warn ??= filter;
  }
  return warn;
}

/**
 * Which filter context a screen belongs to. The feed card renders on every
 * surface, so it reads the place from the route it is on.
 */
export function filterContextForRoute(routeName: string | undefined): FilterContext {
  switch (routeName) {
    case 'PostInfo':
    case 'FeedDetail':
    case 'PostResolver':
    case 'PostResolverNewPost':
      return 'thread';
    case 'Notifications':
      return 'notifications';
    case 'Explore':
    case 'Search':
    case 'ShortsViewer':
    case 'ImageFeed':
    case 'Leaderboard':
      return 'public';
    case 'Profile':
    case 'YourVideos':
      return 'profile';
    default:
      return 'home';
  }
}
