import { getThemeSkin } from '../../theme/skins';
import { isAppThemeName } from '../../theme/colors';
import { DEFAULT_THEME_HUES, themeAccent, tintSkin } from '../../theme/themeColor';
import { THEME_ICON_KEYS, themeIconUrl } from '../../theme/icons';

it('restores Glass and its custom colour as a complete native skin', () => {
  expect(isAppThemeName('glass')).toBe(true);
  expect(DEFAULT_THEME_HUES.glass).toBe(185);
  const base = getThemeSkin('glass')!;
  const teal = tintSkin(base, themeAccent('glass', {}, []));
  const rose = tintSkin(base, themeAccent('glass', { glass: 330 }, []));
  expect(teal.page).not.toBe(rose.page);
  expect(teal.card.backgroundColor).not.toBe(rose.card.backgroundColor);
  expect(rose.card.borderRadius).toBe(24);
  expect(rose.card.borderTopColor).toBe(teal.card.borderTopColor);
  expect(base.page).toBe('#082a30');
});

it('uses the Glass line family for every page and power without System fallbacks', () => {
  for (const key of THEME_ICON_KEYS) expect(themeIconUrl('glass', key)).toContain(`/glass/${key}.svg`);
  expect(themeIconUrl('glass', 'unpublished')).toBeUndefined();
});
