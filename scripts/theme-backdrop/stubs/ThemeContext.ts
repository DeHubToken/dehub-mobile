// dehubweb's ThemeContext, reduced to what the background components read.
// The theme comes from the page hash (see ../entry.tsx); hues are web's defaults.
export const DEFAULT_THEME_HUES: Record<string, number> = { cosmic: -1, hazy: 260, swarms: 200, lavalamp: 20 };

export function useAppTheme() {
  const w = window as unknown as Record<string, unknown>;
  return {
    theme: w.__THEME as string,
    themeHues: DEFAULT_THEME_HUES,
    brandColors: [] as string[],
    dimLights: false,
    dimStrength: 50,
  };
}
