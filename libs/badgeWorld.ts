/** The material of an opened badge. Inline badge art is unchanged. */
export const BADGE_WORLD_THEMES = [
  'cosmic', 'winter', 'jungle', 'hazy', 'swarms',
  'lavalamp', 'island', 'horror', 'war', 'hacker',
] as const;

export type BadgeWorld = typeof BADGE_WORLD_THEMES[number];
export function badgeWorld(theme: string): BadgeWorld | null {
  const normalized = theme === 'christmas' ? 'winter' : theme;
  return BADGE_WORLD_THEMES.find(world => world === normalized) ?? null;
}
