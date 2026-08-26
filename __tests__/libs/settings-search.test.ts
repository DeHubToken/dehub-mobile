/**
 * The settings search's contract.
 *
 * The JOIN first: every index entry names an `anchor`, and the jump only works
 * if a `<SettingsAnchor id="…">` (or an `anchor` prop on a SettingsSection)
 * exists in that tab's panel. Nothing links the two at build time — rename a
 * section and search quietly goes back to what it used to do, which is switch
 * tab and abandon you. So the anchors are read out of the panels here.
 *
 * Then BEHAVIOUR: the ranking and the keyword table exist so someone who does
 * not know what we called a setting still lands on it. Every query below is
 * phrased the way a reader would actually type it.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { SETTINGS_SEARCH_INDEX, searchSettings } from '../../libs/settings-search';

/** Stand-in for i18next's `t` — returns the fallback, as English does. */
const t = ((key: string, fallback?: string) => fallback ?? key) as never;

const ROOT = resolve(__dirname, '..', '..');

function collect(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(name)) out.push(readFileSync(full, 'utf8'));
  }
  return out;
}

const SOURCES = [
  ...collect(join(ROOT, 'components', 'Settings')),
  readFileSync(join(ROOT, 'screens', 'AccountSettingsScreen.tsx'), 'utf8'),
  readFileSync(join(ROOT, 'screens', 'NotificationSettingsScreen.tsx'), 'utf8'),
  readFileSync(join(ROOT, 'screens', 'PrivacySettingsScreen.tsx'), 'utf8'),
].join('\n');

const ANCHORS = new Set<string>();
for (const pattern of [/<SettingsAnchor[^>]*id="([a-z0-9-]+)"/g, /\banchor="([a-z0-9-]+)"/g]) {
  let match = pattern.exec(SOURCES);
  while (match) {
    ANCHORS.add(match[1]);
    match = pattern.exec(SOURCES);
  }
}
// The notification categories are rendered from a list, so their anchors are
// built rather than written out: `id={'notify-' + category.key}`.
if (/id=\{'notify-' \+ category\.key\}/.test(SOURCES)) {
  for (const key of ['engagement', 'social', 'monetization', 'content']) {
    ANCHORS.add(`notify-${key}`);
  }
}

describe('settings search index', () => {
  it('points every entry at an anchor that exists in a panel', () => {
    const missing = SETTINGS_SEARCH_INDEX.filter((entry) => !ANCHORS.has(entry.anchor)).map(
      (entry) => `${entry.tab}/${entry.anchor}`,
    );
    expect(missing).toEqual([]);
  });

  it('keeps one label per anchor, so the list never repeats itself', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of SETTINGS_SEARCH_INDEX) {
      const id = `${entry.anchor}:${entry.label}`;
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    expect(duplicates).toEqual([]);
  });
});

describe('searchSettings', () => {
  const top = (query: string) => searchSettings(query, t)[0];

  it('returns nothing for an empty query', () => {
    expect(searchSettings('', t)).toEqual([]);
    expect(searchSettings('   ', t)).toEqual([]);
  });

  it('puts the closest label first', () => {
    expect(top('the')?.anchor).toBe('theme');
    expect(top('quiet')?.anchor).toBe('quiet-hours');
    expect(top('storage')?.anchor).toBe('message-storage');
  });

  it('finds settings by what people call them, not what we called them', () => {
    expect(top('dark mode')?.anchor).toBe('theme');
    expect(top('nsfw')?.anchor).toBe('content-filtering');
    expect(top('2fa')?.anchor).toBe('account-security');
    expect(top('dnd')?.anchor).toBe('dm-access');
    expect(top('country')?.anchor).toBe('geo-blocking');
  });

  it('requires every word typed to match something', () => {
    expect(searchSettings('quiet zzzz', t)).toEqual([]);
  });

  it('caps the list so it cannot push the tabs off screen', () => {
    expect(searchSettings('e', t).length).toBeLessThanOrEqual(8);
  });

  it('carries the tab, so a hit can switch to it before scrolling', () => {
    expect(top('gas')?.tab).toBe('assets');
    expect(top('report bug')?.tab).toBe('support');
    expect(top('auto-play')?.tab).toBe('appearance');
  });
});
