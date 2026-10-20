import { APP_THEMES } from '../../theme/colors';
import { themeIconUrl, THEME_ICON_REVISION, THEME_ICON_KEYS } from '../../theme/icons';
import { PAGE_IDENTITY_ICONS, pageIdentityIcon } from '../../theme/pageIdentity';

it('uses the transparent power artwork in the same active theme pack', () => {
  expect(themeIconUrl('hazy', 'boost')).toContain(`/theme-icons/hazy/boost.png?v=${THEME_ICON_REVISION}`);
  expect(themeIconUrl('winter', 'comment-anchor')).toContain('/theme-icons/winter/comment-anchor.png');
});

it('requests the active raster family with one shared cache revision', () => {
  for (const theme of APP_THEMES) {
    for (const key of ['home', 'usernames', 'tv', 'accounts', 'arcade', 'fractions', 'staking', 'command', 'superpowers', 'paint']) {
      expect(themeIconUrl(theme, key)).toContain(`/theme-icons/${theme === 'immersive' || theme === 'system-light' ? 'system' : theme}/${key}.${theme === 'glass' ? 'svg' : 'webp'}?v=${THEME_ICON_REVISION}`);
    }
  }
});

it('uses each custom pack instead of System artwork or generic glyphs', () => {
  for (const theme of ['war', 'hacker', 'island', 'horror']) {
    expect(themeIconUrl(theme, 'usernames')).toContain(`/theme-icons/${theme}/usernames.webp`);
  }
  expect(themeIconUrl('unknown-theme', 'usernames')).toBeUndefined();
});

it('uses published artwork for every routed page and rejects missing artwork', () => {
  for (const [route, key] of Object.entries(PAGE_IDENTITY_ICONS)) {
    expect(THEME_ICON_KEYS).toContain(key);
    expect(pageIdentityIcon(route)).toBe(key);
    for (const theme of APP_THEMES) expect(themeIconUrl(theme, key!)).toBeDefined();
  }
  expect(themeIconUrl('hazy', 'creator')).toContain('/hazy/wand.webp');
  expect(themeIconUrl('hazy', 'unpublished-key')).toBeUndefined();
  expect(pageIdentityIcon('unknown-page')).toBeUndefined();
});
