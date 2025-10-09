import { useCallback, useMemo, useRef, useState } from "react";

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

// Map amount thresholds to tiers per provided giftTiers
export const tierKeyFromAmount = (amt: number): TipTierKey => {
  if (amt >= 1_000_000) return "ultimate";
  if (amt >= 750_000) return "gold10";
  if (amt >= 500_000) return "gold3";
  if (amt >= 300_000) return "party";
  if (amt >= 200_000) return "spartans";
  if (amt >= 100_000) return "magicRing";
  if (amt >= 50_000) return "crown";
  if (amt >= 25_000) return "bouquet";
  if (amt >= 10_000) return "chocolate";
  return "heart";
};

const durationFromTier = (tier: TipTierKey): number => {
  switch (tier) {
    case "ultimate":
      return 12000; // "all celebrations + extra" slightly longer
    case "gold10":
      return 10000;
    case "gold3":
      return 3000;
    case "party":
      return 4000;
    case "spartans":
      return 4000;
    case "magicRing":
      return 2500;
    case "crown":
      return 2500;
    case "bouquet":
      return 2500;
    case "chocolate":
      return 2200;
    case "heart":
    default:
      return 1800;
  }
};

const normalizeTierFromGift = (gift?: GiftMeta): TipTierKey => {
  const amt = Number(gift?.amount || 0);
  return tierKeyFromAmount(amt);
};

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
      const tier = normalizeTierFromGift(gift);
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
