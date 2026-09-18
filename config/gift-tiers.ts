/**
 * Live stream gift tiers
 * ======================
 * One ladder, shared by the picker, the tier lookup and the celebration
 * overlay.
 *
 * `name` is the wire value: GiftModal writes it into the gift record as
 * `selectedTier`, the backend broadcasts it on `streamer.tip`, and both this
 * app and dehubweb read it back to decide which celebration to play. Changing
 * a name silently downgrades every cross-platform gift to a Love Heart, so
 * these strings match src/lib/live/gift-tiers.ts on web exactly.
 *
 * The display copy in components/Tip/GiftModal.tsx (description)
 * hangs off the same mins and names — keep the two in step.
 */
export type TipTierKey =
  | "ultimate"
  | "gold10"
  | "gold3"
  | "party"
  | "spartans"
  | "magicRing"
  | "crown"
  | "bouquet"
  | "chocolate"
  | "heart";

export interface GiftTierSpec {
  key: TipTierKey;
  /** Lowest DHB amount that buys this tier. */
  min: number;
  /** The wire name. Matched by web — not translated. */
  name: string;
  /** The character that floats up the bottom-right corner. */
  emoji: string;
  /** How long the celebration holds the screen. */
  durationMs: number;
}

/** Richest first, so the first match on an amount is the right tier. */
export const GIFT_TIERS: readonly GiftTierSpec[] = [
  { key: "ultimate", min: 1_000_000, name: "Ultimate Celebration", emoji: "🏆", durationMs: 12000 },
  { key: "gold10", min: 750_000, name: "Golden Screen (10s)", emoji: "🪙", durationMs: 10000 },
  { key: "gold3", min: 500_000, name: "Golden Screen (3s)", emoji: "🪙", durationMs: 3600 },
  { key: "party", min: 300_000, name: "Party Celebration", emoji: "🎉", durationMs: 5000 },
  { key: "spartans", min: 200_000, name: "Spartans Army", emoji: "🛡️", durationMs: 4500 },
  { key: "magicRing", min: 100_000, name: "Magic Ring", emoji: "💍", durationMs: 3500 },
  { key: "crown", min: 50_000, name: "Crown", emoji: "👑", durationMs: 3200 },
  { key: "bouquet", min: 25_000, name: "Bouquet of Flowers", emoji: "💐", durationMs: 3000 },
  { key: "chocolate", min: 10_000, name: "Box of Chocolate", emoji: "🍫", durationMs: 2800 },
  { key: "heart", min: 1_000, name: "Love Heart", emoji: "❤️", durationMs: 2400 },
] as const;

/** The floor: a gift below the ladder still plays something. */
export const BASE_GIFT_TIER = GIFT_TIERS[GIFT_TIERS.length - 1];

export const tierFromAmount = (amount: number): GiftTierSpec => {
  const amt = Number(amount) || 0;
  return GIFT_TIERS.find((t) => amt >= t.min) ?? BASE_GIFT_TIER;
};

export const tierByKey = (key: TipTierKey): GiftTierSpec =>
  GIFT_TIERS.find((t) => t.key === key) ?? BASE_GIFT_TIER;

/**
 * What a gift record says it bought.
 *
 * The name wins when we recognise it — it is what the sender picked and paid
 * for. The amount is the fallback, for older records and any producer that
 * does not send a tier.
 */
export const tierFromGift = (gift?: {
  amount?: number | string;
  selectedTier?: string;
}): GiftTierSpec => {
  const named = gift?.selectedTier
    ? GIFT_TIERS.find((t) => t.name === gift.selectedTier)
    : undefined;
  return named ?? tierFromAmount(Number(gift?.amount) || 0);
};
