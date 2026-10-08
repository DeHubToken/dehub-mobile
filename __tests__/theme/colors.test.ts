import {
  APP_THEMES,
  colors,
  getThemeColors,
  isAppThemeName,
  setActiveTheme,
  systemColors,
  minimalColors,
} from '../../theme/colors';
import { getThemeSkin } from '../../theme/skins';
import { createToastTheme } from '../../theme/toastTheme';

describe('mobile app themes', () => {
  afterEach(() => setActiveTheme('system'));

  it('keeps the existing system palette unchanged', () => {
    expect(systemColors.background).toBe('#010305');
    expect(systemColors.foreground).toBe('#FFFFFF');
    expect(systemColors.neutrals[900]).toBe('#010305');
  });

  it('keeps legacy render-time color reads on the system theme', () => {
    setActiveTheme('system');
    expect(colors.background).toBe('#010305');
    expect(colors.neutrals[100]).toBe('#F9FBFF');
  });

  it('only accepts themes that the mobile engine currently implements', () => {
    expect(isAppThemeName('system')).toBe(true);
    expect(isAppThemeName('minimal')).toBe(true);
    for (const name of ['cosmic', 'hazy', 'swarms', 'lavalamp', 'winter', 'war', 'osaka', 'jungle']) {
      expect(isAppThemeName(name)).toBe(true);
    }
    expect(isAppThemeName('light')).toBe(false);
    expect(isAppThemeName('christmas')).toBe(false);
    expect(isAppThemeName(null)).toBe(false);
    expect(getThemeColors('system')).toBe(systemColors);
  });

  it('gives every canvas theme a solid page colour and a skin, and system and minimal none', () => {
    for (const name of APP_THEMES) {
      const skin = getThemeSkin(name);
      if (name === 'system' || name === 'immersive' || name === 'minimal') {
        expect(skin).toBeNull();
        continue;
      }
      expect(skin).not.toBeNull();
      // The page colour is what every non-feed screen paints; it must be solid
      // hex (root variables are built from it) and match the palette.
      expect(skin!.page).toMatch(/^#[0-9A-F]{6}$/i);
      expect(getThemeColors(name).background).toBe(skin!.page);
      expect(getThemeColors(name).neutrals[900]).toBe(skin!.page);
    }
    expect(getThemeSkin('war')!.square).toBe(true);
    expect(getThemeSkin('osaka')!.square).toBe(false);
  });

  it('puts minimal on a pure black canvas and follows it at render time', () => {
    expect(getThemeColors('minimal')).toBe(minimalColors);
    expect(minimalColors.background).toBe('#000000');
    expect(minimalColors.neutrals[900]).toBe('#000000');
    setActiveTheme('minimal');
    expect(colors.background).toBe('#000000');
  });

  it('builds toast surfaces from the system palette', () => {
    const toastTheme = createToastTheme(systemColors);

    expect(toastTheme.containerStyle.backgroundColor).toBe('#1C1C1C');
    expect(toastTheme.containerStyle.borderColor).toBe('#333333');
    expect(toastTheme.textStyle.color).toBe('#FFFFFF');
  });
});
