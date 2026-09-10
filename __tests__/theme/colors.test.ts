import {
  colors,
  getThemeColors,
  isAppThemeName,
  lightColors,
  setActiveTheme,
  systemColors,
} from '../../theme/colors';
import { createToastTheme } from '../../theme/toastTheme';

describe('mobile app themes', () => {
  afterEach(() => setActiveTheme('system'));

  it('copies the web light paper and ink tokens', () => {
    expect(lightColors.background).toBe('#F9F8F4');
    expect(lightColors.muted).toBe('#ECE8DF');
    expect(lightColors.foreground).toBe('#1A1A1A');
    expect(lightColors.mutedForeground).toBe('#5A5A5A');
    expect(lightColors.neutrals[500]).toBe('#71717A');
  });

  it('keeps the existing system palette unchanged', () => {
    expect(systemColors.background).toBe('#010305');
    expect(systemColors.foreground).toBe('#FFFFFF');
    expect(systemColors.neutrals[900]).toBe('#010305');
  });

  it('switches legacy render-time color reads with the active theme', () => {
    setActiveTheme('light');
    expect(colors.background).toBe('#F9F8F4');
    expect(colors.neutrals[100]).toBe('#1A1A1A');

    setActiveTheme('system');
    expect(colors.background).toBe('#010305');
    expect(colors.neutrals[100]).toBe('#F9FBFF');
  });

  it('only accepts themes that the mobile engine currently implements', () => {
    expect(isAppThemeName('system')).toBe(true);
    expect(isAppThemeName('light')).toBe(true);
    expect(isAppThemeName('cosmic')).toBe(false);
    expect(getThemeColors('light')).toBe(lightColors);
  });

  it('builds light toast surfaces from the active paper palette', () => {
    const toastTheme = createToastTheme(lightColors);

    expect(toastTheme.containerStyle.backgroundColor).toBe('#F9F8F4');
    expect(toastTheme.containerStyle.borderColor).toBe('#DEDAD1');
    expect(toastTheme.textStyle.color).toBe('#1A1A1A');
  });
});
