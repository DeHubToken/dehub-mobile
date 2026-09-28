// What each badge tier may publish as creator packs (emoji, sticker, GIF).
//
// Creating packs is a badge-holder perk: no badge, no packs. Using and saving
// other people's packs is open to everyone. `packs` is per kind, so a Crab can
// run one emoji pack, one sticker pack and one GIF pack at the same time.
//
// Mirrored by `supabase/functions/_shared/creator-pack-limits.ts` — the server
// enforces these numbers, this file only shows them. `limits.test.ts`
// fails the build if the two disagree.

export type PackKind = "emoji" | "sticker" | "gif";

export const PACK_KINDS: PackKind[] = ["emoji", "sticker", "gif"];

export const PACK_TIER_ORDER = [
  "Crab", "Ghost Lobster", "Piranha", "Giant Tortoise", "King Cobra", "Octopus", "Crocodile",
  "Dolphin", "Tiger Shark", "Great White Shark", "Killer Whale", "Blue Whale", "Megalodon",
];

// One column per tier, in PACK_TIER_ORDER.
const PACKS_PER_KIND = [1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 12, 15];
const ITEMS_PER_PACK: Record<PackKind, number[]> = {
  emoji: [8, 12, 16, 24, 32, 48, 64, 80, 100, 120, 150, 180, 200],
  sticker: [5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 100, 110, 120],
  gif: [3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120],
};

export interface PackLimits {
  /** Packs of each kind this tier may own. 0 means no badge. */
  packs: number;
  /** Items one pack of each kind may hold. */
  items: Record<PackKind, number>;
}

export const NO_PACK_LIMITS: PackLimits = { packs: 0, items: { emoji: 0, sticker: 0, gif: 0 } };

export function packLimitsFor(tier: string | null | undefined): PackLimits {
  const i = tier ? PACK_TIER_ORDER.indexOf(tier === "Lobster" ? "Ghost Lobster" : tier) : -1;
  if (i < 0) return NO_PACK_LIMITS;
  return {
    packs: PACKS_PER_KIND[i],
    items: { emoji: ITEMS_PER_PACK.emoji[i], sticker: ITEMS_PER_PACK.sticker[i], gif: ITEMS_PER_PACK.gif[i] },
  };
}
