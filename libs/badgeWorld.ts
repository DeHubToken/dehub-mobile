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

/** Themes whose opened badge is the 3D metal badge dressed for that theme. */
export const BADGE_LOOK_THEMES = ['glass', ...BADGE_WORLD_THEMES] as const;
export type BadgeLook = typeof BADGE_LOOK_THEMES[number];
export function badgeLook(theme: string): BadgeLook | null {
  const normalized = theme === 'christmas' ? 'winter' : theme;
  return BADGE_LOOK_THEMES.find(look => look === normalized) ?? null;
}
