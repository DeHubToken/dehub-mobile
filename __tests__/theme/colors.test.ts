import {
  colors,
  getThemeColors,
  isAppThemeName,
  setActiveTheme,
  systemColors,
  minimalColors,
} from '../../theme/colors';
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
    expect(isAppThemeName('light')).toBe(false);
    expect(isAppThemeName('cosmic')).toBe(false);
    expect(getThemeColors('system')).toBe(systemColors);
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
