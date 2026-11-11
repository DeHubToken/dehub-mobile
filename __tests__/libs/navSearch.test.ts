import en from '../../i18n/locales/en.json';
import { filterNavRows, NAV_ENGLISH_NAMES, NAV_FIND_WORDS, NAV_KEYWORDS } from '../../libs/navSearch';

/** Resolve a key against the English bundle, falling back like the app does. */
const lookup = (bundle: unknown, key: string): string | undefined => {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
  return typeof value === 'string' ? value : undefined;
};
const t = (key: string, defaultValue: string) => lookup(en, key) ?? defaultValue;

const ROWS = Object.keys(NAV_ENGLISH_NAMES).map((labelKey) => ({
  labelKey,
  // The same rows the menu sheet keeps out of the resting menu.
  searchOnly: ['nav.home', 'nav.nfts', 'nav.bridge', 'nav.premium', 'nav.pricing', 'top100.title', 'work.myBounties',
    'buyCoins.title', 'publicChat.title', 'planned.title', 'liveStudio.title', 'launchpad.title'].includes(labelKey),
}));
const search = (query: string, translate = t) => filterNavRows(ROWS, query, translate).map((row) => row.labelKey);

describe('app menu search', () => {
  it('leaves the resting menu alone when nothing is typed', () => {
    expect(search('')).toEqual(ROWS.filter((row) => !row.searchOnly).map((row) => row.labelKey));
    expect(search('   ')).not.toContain('top100.title');
  });

  it('puts Requests first for "build" and finds it from the words around it', () => {
    expect(search('build')[0]).toBe('nav.featureRequests');
    for (const query of ['builders', 'building', 'bug', 'bugs', 'report a bug', 'ideas', 'roadmap', 'requests']) {
      expect(search(query)).toContain('nav.featureRequests');
    }
  });

  it('finds pages by what they do', () => {
    expect(search('games')).toContain('nav.arcade');
    expect(search('dm')).toContain('nav.messages');
    expect(search('money')).toContain('nav.wallet');
    expect(search('dark mode')).toContain('nav.settings');
    expect(search('emoji')).toContain('creatorPacks.title');
    expect(search('global chat')).toContain('publicChat.title');
    expect(search('market cap')).toContain('top100.title');
  });

  it('matches the English name even when the label reads differently', () => {
    expect(search('feature requests')).toContain('nav.featureRequests');
    expect(search('command centre')).toContain('nav.command');
  });

  it('survives small typos and ranks a name match first', () => {
    expect(search('setings')).toContain('nav.settings');
    expect(search('arcde')).toContain('nav.arcade');
    expect(search('wallet')[0]).toBe('nav.wallet');
    expect(search('zzzzz')).toEqual([]);
  });

  it('matches the translated label and translated search words', () => {
    const spanish: Record<string, string> = {
      'nav.featureRequests': 'Solicitudes',
      'nav.findWords.featureRequests': 'construir, constructores, ideas, reportar un error, errores',
    };
    const es = (key: string, fallback: string) => spanish[key] ?? t(key, fallback);
    expect(search('solicitudes', es)).toContain('nav.featureRequests');
    expect(search('construir', es)).toContain('nav.featureRequests');
    const japanese: Record<string, string> = { 'nav.findWords.featureRequests': 'ビルド、バグ、アイデア' };
    const ja = (key: string, fallback: string) => japanese[key] ?? t(key, fallback);
    expect(search('バグ', ja)).toContain('nav.featureRequests');
  });

  it('keeps every table keyed to a row that exists, with English search words for translators', () => {
    const findWords = (en as { nav: { findWords: Record<string, string> } }).nav.findWords;
    for (const labelKey of Object.keys(NAV_ENGLISH_NAMES)) {
      expect(NAV_KEYWORDS[labelKey]?.length).toBeGreaterThan(0);
      expect(findWords[NAV_FIND_WORDS[labelKey]]).toBeTruthy();
    }
  });
});
