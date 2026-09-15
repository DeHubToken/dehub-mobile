/**
 * Plural fallback
 * ===============
 * i18next resolves a `count` to a CLDR plural category and looks up
 * `key_<category>`. Our locale files only ever carry `_one` and `_other`, which
 * is all English needs — but Arabic has six categories, Polish and Russian have
 * four, Hebrew and Romanian three. In those languages count=2, 3 or 11 resolve
 * to `_two`, `_few` or `_many`, find nothing, and fall through to fallbackLng
 * 'en'. The reader gets an English sentence in the middle of a fully translated
 * screen, even though `_one` and `_other` were both translated.
 *
 * This fills every category the language actually asks for from the string that
 * locale already has, so nothing falls back to English. A six-form language
 * ends up with two real forms rather than six — the same trade the migrate
 * surfaces already make by picking singular/plural at the call site — but it is
 * the locale's own words at every count instead of English at most of them.
 *
 * Two things make it safe to run over every bundle:
 *
 *   1. Suffixes come from i18next's own plural resolver, not from a table here,
 *      so the keys written are exactly the keys `t()` will go looking for. A
 *      language with two categories produces an empty patch and costs nothing.
 *   2. An existing translation is never overwritten. Only absent categories are
 *      added, so a real `_few` written later always wins.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bundle = Record<string, any>;

const OTHER = '_other';

function collect(node: Bundle, suffixes: string[], patch: Bundle): void {
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child: Bundle = {};
      collect(value, suffixes, child);
      if (Object.keys(child).length > 0) patch[key] = child;
      continue;
    }
    if (typeof value !== 'string' || !key.endsWith(OTHER)) continue;
    const base = key.slice(0, -OTHER.length);
    for (const suffix of suffixes) {
      if (typeof node[base + suffix] === 'string') continue;
      patch[base + suffix] = value;
    }
  }
}

function countLeaves(node: Bundle): number {
  let total = 0;
  for (const value of Object.values(node)) {
    total += value && typeof value === 'object' ? countLeaves(value) : 1;
  }
  return total;
}

/**
 * Add the plural categories `lng` needs but its bundle does not define.
 * Call it after the locale (and any feature bundles) have been merged.
 * Returns the number of keys added, for logging and tests.
 */
export function fillMissingPluralForms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  i18n: any,
  lng: string,
): number {
  const bundle = i18n.getResourceBundle(lng, 'translation') as Bundle | undefined;
  if (!bundle) return 0;

  let suffixes: string[] | undefined;
  try {
    // Hermes and older browsers without Intl.PluralRules land here; leaving the
    // bundle untouched is exactly today's behaviour, so degrading is harmless.
    suffixes = i18n.services?.pluralResolver?.getSuffixes(lng);
  } catch {
    return 0;
  }
  if (!Array.isArray(suffixes) || suffixes.length === 0) return 0;

  const patch: Bundle = {};
  collect(bundle, suffixes, patch);
  const added = countLeaves(patch);
  if (added > 0) i18n.addResourceBundle(lng, 'translation', patch, true, false);
  return added;
}
