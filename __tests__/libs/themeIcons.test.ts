import { APP_THEMES } from '../../theme/colors';
import { themeIconUrl, THEME_ICON_REVISION } from '../../theme/icons';

it('uses the transparent power artwork in the same active theme pack', () => {
  expect(themeIconUrl('hazy', 'boost')).toContain(`/theme-icons/hazy/boost.png?v=${THEME_ICON_REVISION}`);
  expect(themeIconUrl('winter', 'comment-anchor')).toContain('/theme-icons/winter/comment-anchor.png');
});

it('requests the active raster family with one shared cache revision', () => {
  for (const theme of APP_THEMES) {
    for (const key of ['home', 'usernames', 'tv', 'accounts', 'arcade', 'fractions', 'staking', 'command', 'superpowers']) {
      expect(themeIconUrl(theme, key)).toContain(`/theme-icons/${theme}/${key}.webp?v=${THEME_ICON_REVISION}`);
    }
  }
});

it('uses each custom pack instead of System artwork or generic glyphs', () => {
  for (const theme of ['war', 'hacker', 'island', 'horror']) {
    expect(themeIconUrl(theme, 'usernames')).toContain(`/theme-icons/${theme}/usernames.webp`);
  }
  expect(themeIconUrl('unknown-theme', 'usernames')).toBeUndefined();
});
