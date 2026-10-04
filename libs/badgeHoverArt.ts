interface BadgeHoverArt {
  poster: number;
  animation: number;
  posterBounds: { left: number; top: number; right: number; bottom: number };
  bounds: { left: number; top: number; right: number; bottom: number };
}

const artwork: Record<string, BadgeHoverArt> = {
  "Crab": { poster: require('../assets/badges/hover/crab.png'), animation: require('../assets/badges/hover/crab-animation.webp'), bounds: {"left":9,"top":10,"right":119,"bottom":119} , posterBounds: { left: 12, top: 21, right: 119, bottom: 117 } },
  "Ghost Lobster": { poster: require('../assets/badges/hover/ghost-lobster.png'), animation: require('../assets/badges/hover/ghost-lobster-animation.webp'), bounds: {"left":3,"top":11,"right":126,"bottom":119} , posterBounds: { left: 9, top: 13, right: 121, bottom: 118 } },
  "Piranha": { poster: require('../assets/badges/hover/piranha.png'), animation: require('../assets/badges/hover/piranha-animation.webp'), bounds: {"left":5,"top":11,"right":122,"bottom":126} , posterBounds: { left: 8, top: 16, right: 121, bottom: 124 } },
  "Giant Tortoise": { poster: require('../assets/badges/hover/giant-tortoise.png'), animation: require('../assets/badges/hover/giant-tortoise-animation.webp'), bounds: {"left":11,"top":11,"right":122,"bottom":112} , posterBounds: { left: 11, top: 17, right: 122, bottom: 112 } },
  "King Cobra": { poster: require('../assets/badges/hover/king-cobra.png'), animation: require('../assets/badges/hover/king-cobra-animation.webp'), bounds: {"left":15,"top":7,"right":117,"bottom":124} , posterBounds: { left: 16, top: 8, right: 117, bottom: 124 } },
  "Octopus": { poster: require('../assets/badges/hover/octopus.png'), animation: require('../assets/badges/hover/octopus-animation.webp'), bounds: {"left":12,"top":15,"right":122,"bottom":124} , posterBounds: { left: 12, top: 15, right: 122, bottom: 124 } },
  "Crocodile": { poster: require('../assets/badges/hover/crocodile.png'), animation: require('../assets/badges/hover/crocodile-animation.webp'), bounds: {"left":7,"top":7,"right":121,"bottom":123} , posterBounds: { left: 8, top: 17, right: 119, bottom: 123 } },
  "Dolphin": { poster: require('../assets/badges/hover/dolphin.png'), animation: require('../assets/badges/hover/dolphin-animation.webp'), bounds: {"left":15,"top":0,"right":125,"bottom":126} , posterBounds: { left: 19, top: 9, right: 120, bottom: 122 } },
  "Tiger Shark": { poster: require('../assets/badges/hover/tiger-shark.png'), animation: require('../assets/badges/hover/tiger-shark-animation.webp'), bounds: {"left":6,"top":12,"right":122,"bottom":121} , posterBounds: { left: 7, top: 13, right: 121, bottom: 121 } },
  "Great White Shark": { poster: require('../assets/badges/hover/great-white-shark.png'), animation: require('../assets/badges/hover/great-white-shark-animation.webp'), bounds: {"left":4,"top":6,"right":122,"bottom":121} , posterBounds: { left: 5, top: 15, right: 120, bottom: 121 } },
  "Killer Whale": { poster: require('../assets/badges/hover/killer-whale.png'), animation: require('../assets/badges/hover/killer-whale-animation.webp'), bounds: {"left":4,"top":4,"right":125,"bottom":125} , posterBounds: { left: 19, top: 11, right: 93, bottom: 98 } },
  "Blue Whale": { poster: require('../assets/badges/hover/blue-whale.png'), animation: require('../assets/badges/hover/blue-whale-animation.webp'), bounds: {"left":0,"top":0,"right":128,"bottom":128} , posterBounds: { left: 16, top: 24, right: 122, bottom: 126 } },
  "Megalodon": { poster: require('../assets/badges/hover/megalodon.png'), animation: require('../assets/badges/hover/megalodon-animation.webp'), bounds: {"left":2,"top":8,"right":126,"bottom":128} , posterBounds: { left: 5, top: 19, right: 124, bottom: 126 } },
};

export function badgeHoverArt(tier: string | null | undefined): BadgeHoverArt | null {
  return tier ? artwork[tier] ?? null : null;
}
