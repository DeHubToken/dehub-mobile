import { APP_THEMES } from '../../theme/colors';
import { themeIconUrl, THEME_ICON_REVISION } from '../../theme/icons';

it('requests the active raster family with one shared cache revision', () => {
  for (const theme of APP_THEMES.filter((name) => !['war', 'hacker', 'island', 'horror'].includes(name))) {
    for (const key of ['home', 'usernames', 'tv', 'accounts', 'arcade', 'fractions', 'staking', 'command', 'superpowers']) {
      expect(themeIconUrl(theme, key)).toContain(`/theme-icons/${theme}/${key}.webp?v=${THEME_ICON_REVISION}`);
    }
  }
});

it('never substitutes System silver artwork for a glyph theme', () => {
  for (const theme of ['war', 'hacker', 'island', 'horror']) {
    expect(themeIconUrl(theme, 'usernames')).toBeUndefined();
  }
});
