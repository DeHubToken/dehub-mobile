/**
 * Upper-tier scales account for the opaque area inside each silhouette.
 * Fins and tails make Tiger Shark and Killer Whale read smaller at equal
 * height. These values increase visible area through the upper five tiers.
 * Keep aligned with the web badge sizing table.
 */
export const badgeTierScale: Record<string, number> = {
  'Tiger Shark': 1.08,
  'Killer Whale': 1.14,
  'Great White Shark': 1.04,
  'Blue Whale': 1.035,
  'Megalodon': 1.069,
};

interface BadgeHoverArt {
  poster: number;
  animation: number;
  posterBounds: { left: number; top: number; right: number; bottom: number };
  /** Row the poster's body rests on (see BADGE_SIT in libs/misc.ts). */
  posterSit: number;
}

const artwork: Record<string, BadgeHoverArt> = {
  "Crab": { poster: require('../assets/badges/hover/crab.png'), animation: require('../assets/badges/hover/crab-animation.webp'), posterBounds: { left: 12, top: 21, right: 119, bottom: 117 }, posterSit: 113 },
  "Ghost Lobster": { poster: require('../assets/badges/hover/ghost-lobster.png'), animation: require('../assets/badges/hover/ghost-lobster-animation.webp'), posterBounds: { left: 9, top: 13, right: 121, bottom: 118 }, posterSit: 114 },
  "Piranha": { poster: require('../assets/badges/hover/piranha.png'), animation: require('../assets/badges/hover/piranha-animation.webp'), posterBounds: { left: 8, top: 16, right: 121, bottom: 124 }, posterSit: 116 },
  "Giant Tortoise": { poster: require('../assets/badges/hover/giant-tortoise.png'), animation: require('../assets/badges/hover/giant-tortoise-animation.webp'), posterBounds: { left: 11, top: 17, right: 122, bottom: 112 }, posterSit: 111 },
  "King Cobra": { poster: require('../assets/badges/hover/king-cobra.png'), animation: require('../assets/badges/hover/king-cobra-animation.webp'), posterBounds: { left: 16, top: 8, right: 117, bottom: 124 }, posterSit: 122 },
  "Octopus": { poster: require('../assets/badges/hover/octopus.png'), animation: require('../assets/badges/hover/octopus-animation.webp'), posterBounds: { left: 12, top: 15, right: 122, bottom: 124 }, posterSit: 122 },
  "Crocodile": { poster: require('../assets/badges/hover/crocodile.png'), animation: require('../assets/badges/hover/crocodile-animation.webp'), posterBounds: { left: 8, top: 17, right: 119, bottom: 123 }, posterSit: 120 },
  "Dolphin": { poster: require('../assets/badges/hover/dolphin.png'), animation: require('../assets/badges/hover/dolphin-animation.webp'), posterBounds: { left: 19, top: 9, right: 120, bottom: 122 }, posterSit: 119 },
  "Tiger Shark": { poster: require('../assets/badges/hover/tiger-shark.png'), animation: require('../assets/badges/hover/tiger-shark-animation.webp'), posterBounds: { left: 7, top: 13, right: 121, bottom: 121 }, posterSit: 112 },
  "Great White Shark": { poster: require('../assets/badges/hover/great-white-shark.png'), animation: require('../assets/badges/hover/great-white-shark-animation.webp'), posterBounds: { left: 5, top: 15, right: 120, bottom: 121 }, posterSit: 114 },
  "Killer Whale": { poster: require('../assets/badges/hover/killer-whale.png'), animation: require('../assets/badges/hover/killer-whale-animation.webp'), posterBounds: { left: 19, top: 11, right: 93, bottom: 98 }, posterSit: 94 },
  "Blue Whale": { poster: require('../assets/badges/hover/blue-whale.png'), animation: require('../assets/badges/hover/blue-whale-animation.webp'), posterBounds: { left: 16, top: 24, right: 122, bottom: 126 }, posterSit: 120 },
  "Megalodon": { poster: require('../assets/badges/hover/megalodon.png'), animation: require('../assets/badges/hover/megalodon-animation.webp'), posterBounds: { left: 9, top: 19, right: 120, bottom: 126 }, posterSit: 121 },
};

export function badgeHoverArt(tier: string | null | undefined): BadgeHoverArt | null {
  return tier ? artwork[tier] ?? null : null;
}
