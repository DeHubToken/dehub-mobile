// Name-badge stills already shrunk for the size they are drawn at next to a
// name: 32px, with @2x and @3x files for sharper screens. Shrinking the 128px
// master on the phone left ragged edges, and these decode far quicker.
const small: Record<string, number> = {
  "Crab": require('../assets/badges/small/crab.webp'),
  "Ghost Lobster": require('../assets/badges/small/ghost-lobster.webp'),
  "Piranha": require('../assets/badges/small/piranha.webp'),
  "Giant Tortoise": require('../assets/badges/small/giant-tortoise.webp'),
  "King Cobra": require('../assets/badges/small/king-cobra.webp'),
  "Octopus": require('../assets/badges/small/octopus.webp'),
  "Crocodile": require('../assets/badges/small/crocodile.webp'),
  "Dolphin": require('../assets/badges/small/dolphin.webp'),
  "Tiger Shark": require('../assets/badges/small/tiger-shark.webp'),
  "Great White Shark": require('../assets/badges/small/great-white-shark.webp'),
  "Killer Whale": require('../assets/badges/small/killer-whale.webp'),
  "Blue Whale": require('../assets/badges/small/blue-whale.webp'),
  "Megalodon": require('../assets/badges/small/megalodon.webp'),
};

/** Largest badge canvas, in points, the small still is sharp enough for. */
export const BADGE_SMALL_MAX = 32;

// Killer Whale keeps its original still, which has a separate light-theme
// drawing; only the dark one has a small copy.
const killerWhale: number = require('../assets/badges/Killer Whale.png');

export function badgeSmallArt(tier: string | null | undefined, source?: number): number | undefined {
  if (!tier || (tier === "Killer Whale" && source !== killerWhale)) return undefined;
  return small[tier];
}
