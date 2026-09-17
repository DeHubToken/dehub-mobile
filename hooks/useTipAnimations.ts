import { useCallback, useMemo, useRef, useState } from "react";
import {
  GIFT_TIERS,
  tierFromAmount,
  tierFromGift,
  type GiftTierSpec,
  type TipTierKey,
} from "../config/gift-tiers";

export type { TipTierKey };

export type TipAnimationItem = {
  id: string;
  tier: TipTierKey;
  amount: number;
  message?: string;
  username?: string;
  startedAt: number;
  durationMs: number;
};

export type GiftMeta = {
  amount?: number | string;
  message?: string;
  username?: string;
  displayName?: string;
  selectedTier?: string;
};

type UseTipAnimationsOpts = {
  maxConcurrent?: number;
};

const nowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** The tier an amount lands on. The ladder itself lives in config/gift-tiers. */
export const tierKeyFromAmount = (amt: number): TipTierKey => tierFromAmount(amt).key;

const durationFromTier = (tier: TipTierKey): number =>
  (GIFT_TIERS.find((t) => t.key === tier) ?? GIFT_TIERS[GIFT_TIERS.length - 1]).durationMs;

/**
 * Which celebration a gift bought.
 *
 * Reads `selectedTier` first and only falls back to the amount. This used to
 * go on amount alone, which was fine while every gift came from this app's own
 * picker — the picker sets the amount TO the tier's min — but web sends
 * arbitrary amounts, so a 600,000 DHB gift bought and paid for as a Golden
 * Screen has to play as one rather than round down.
 */
const specFromGift = (gift?: GiftMeta): GiftTierSpec => tierFromGift(gift);

export const useTipAnimations = (opts?: UseTipAnimationsOpts) => {
  const maxConcurrent = opts?.maxConcurrent ?? 2;

  const [active, setActive] = useState<TipAnimationItem[]>([]);
  const queueRef = useRef<TipAnimationItem[]>([]);
  const timersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const startNextIfNeeded = useCallback(() => {
    setActive((curr) => {
      if (curr.length >= maxConcurrent) return curr;
      const next = queueRef.current.shift();
      if (!next) return curr;
      const timer = setTimeout(() => {
        setActive((list) => list.filter((i) => i.id !== next.id));
        delete timersRef.current[next.id];
        // After finishing one, try start next
        startNextIfNeeded();
      }, next.durationMs);
      timersRef.current[next.id] = timer;
      return curr.concat(next);
    });
  }, [maxConcurrent]);

  const enqueue = useCallback(
    (item: Omit<TipAnimationItem, "id" | "startedAt" | "durationMs">) => {
      const id = nowId();
      const durationMs = durationFromTier(item.tier);
      const full: TipAnimationItem = {
        ...item,
        id,
        startedAt: Date.now(),
        durationMs,
      };
      queueRef.current.push(full);
      startNextIfNeeded();
      return id;
    },
    [startNextIfNeeded]
  );

  const enqueueFromGift = useCallback(
    (gift: GiftMeta | undefined) => {
      const tier = specFromGift(gift).key;
      const amount = Number(gift?.amount || 0);
      const username = gift?.username || gift?.displayName;
      return enqueue({ tier, amount, message: gift?.message, username });
    },
    [enqueue]
  );

  const remove = useCallback(
    (id: string) => {
      const t = timersRef.current[id];
      if (t) {
        clearTimeout(t);
        delete timersRef.current[id];
      }
      setActive((list) => list.filter((i) => i.id !== id));
      queueRef.current = queueRef.current.filter((i) => i.id !== id);
      startNextIfNeeded();
    },
    [startNextIfNeeded]
  );

  const clearAll = useCallback(() => {
    Object.values(timersRef.current).forEach((t) => clearTimeout(t));
    timersRef.current = {};
    queueRef.current = [];
    setActive([]);
  }, []);

  return useMemo(
    () => ({ items: active, enqueue, enqueueFromGift, remove, clearAll }),
    [active, enqueue, enqueueFromGift, remove, clearAll]
  );
};
