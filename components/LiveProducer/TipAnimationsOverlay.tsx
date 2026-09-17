/**
 * Gift celebrations over a live stream
 * ====================================
 * Plays the tier a gift bought: emoji floating up the bottom-right corner on
 * every gift, plus a custom effect per tier on top of it.
 *
 * This replaces a placeholder that drew a text pill and one emoji for all ten
 * tiers — so a Golden Screen, which the picker sells as "the screen turns gold
 * and coins rain down", was a white 10% wash with the words "Golden Screen"
 * over it. The ladder promises specific things and now does them.
 *
 * Every animation runs on Reanimated shared values, which means the UI thread:
 * this overlay sits directly on top of a decoding video, and an Ultimate is
 * around fifty particles at once. Nothing here touches JS per frame, and the
 * host View is `pointerEvents="none"` throughout so a celebration can never
 * swallow a tap on the player.
 */
import React, { memo, useEffect, useMemo } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { TipAnimationItem, TipTierKey } from "../../hooks/useTipAnimations";
import { tierByKey } from "../../config/gift-tiers";

type Props = {
  items: TipAnimationItem[];
};

/**
 * Deterministic pseudo-random from a particle's index.
 *
 * Math.random() in render would reshuffle every particle whenever a second
 * gift arrives and the list re-renders, snapping the ones already in flight to
 * new positions.
 */
const jitter = (seed: number, salt: number) => {
  const v = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const Pill = memo(({ text, extra }: { text: string; extra?: string }) => (
  <View className="px-4 py-2 rounded-xl bg-zinc-900/70 border border-white/10">
    <Text className="text-white font-semibold text-xs">
      {text}
      {extra ? ` • ${extra}` : ""}
    </Text>
  </View>
));

/** Fades in, holds, fades out over the celebration's whole duration. */
const useHold = (durationMs: number) => {
  const o = useSharedValue(0);
  useEffect(() => {
    const fade = Math.min(400, durationMs * 0.15);
    o.value = withSequence(
      withTiming(1, { duration: fade }),
      withDelay(Math.max(0, durationMs - fade * 2), withTiming(0, { duration: fade })),
    );
  }, [durationMs, o]);
  return useAnimatedStyle(() => ({ opacity: o.value }));
};

/* ------------------------------------------------------------------ *
 * Particles
 * ------------------------------------------------------------------ */

/** One emoji climbing out of the bottom-right corner. */
const FloatParticle = memo(
  ({ emoji, index, count, cycleMs, rise }: { emoji: string; index: number; count: number; cycleMs: number; rise: number }) => {
    const a = jitter(index + 1, 3);
    const b = jitter(index + 1, 9);
    const p = useSharedValue(0);

    useEffect(() => {
      p.value = withDelay(
        (index / Math.max(count, 1)) * cycleMs * 0.9,
        withTiming(1, { duration: cycleMs, easing: Easing.out(Easing.quad) }),
      );
    }, [p, index, count, cycleMs]);

    const style = useAnimatedStyle(() => ({
      opacity: p.value < 0.12 ? p.value / 0.12 : p.value > 0.75 ? (1 - p.value) / 0.25 : 1,
      transform: [
        { translateY: -p.value * rise },
        { translateX: Math.sin(p.value * Math.PI * 2 + a * 6) * (12 + a * 26) },
        { scale: 0.5 + Math.min(p.value * 3, 1) * (0.7 + b * 0.5) },
        { rotate: `${(b - 0.5) * 60 * p.value}deg` },
      ],
    }));

    return (
      <Animated.View
        style={[{ position: "absolute", right: 8 + a * 90, bottom: 4 + b * 40 }, style]}
        pointerEvents="none"
      >
        <Text style={{ fontSize: 22 + jitter(index + 1, 17) * 20 }}>{emoji}</Text>
      </Animated.View>
    );
  },
);

const CornerFloat = memo(({ emoji, count, durationMs }: { emoji: string; count: number; durationMs: number }) => {
  const { height } = useWindowDimensions();
  const rise = Math.min(height * 0.7, 520);
  const cycle = Math.min(Math.max(durationMs * 0.75, 1600), 3200);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 0, bottom: 0, width: "55%", height: "100%", overflow: "hidden" }}>
      {seeds.map((i) => (
        <FloatParticle key={i} emoji={emoji} index={i} count={count} cycleMs={cycle} rise={rise} />
      ))}
    </View>
  );
});

/** One glyph falling the full height of the player. */
const FallParticle = memo(
  ({ glyph, index, count, cycleMs, drop, width }: { glyph: string; index: number; count: number; cycleMs: number; drop: number; width: number }) => {
    const a = jitter(index + 1, 23);
    const b = jitter(index + 1, 31);
    const p = useSharedValue(0);

    useEffect(() => {
      p.value = withDelay(
        (index / Math.max(count, 1)) * cycleMs * 0.8,
        withRepeat(withTiming(1, { duration: cycleMs, easing: Easing.linear }), -1, false),
      );
    }, [p, index, count, cycleMs]);

    const style = useAnimatedStyle(() => ({
      opacity: p.value > 0.9 ? (1 - p.value) / 0.1 : 1,
      transform: [
        { translateY: p.value * drop },
        { translateX: Math.sin(p.value * Math.PI * 3) * (10 + b * 28) },
        { rotate: `${p.value * (a - 0.5) * 720}deg` },
      ],
    }));

    return (
      <Animated.View style={[{ position: "absolute", left: a * width, top: -30 }, style]} pointerEvents="none">
        <Text style={{ fontSize: 16 + b * 16 }}>{glyph}</Text>
      </Animated.View>
    );
  },
);

const Rain = memo(({ glyphs, count, durationMs }: { glyphs: string[]; count: number; durationMs: number }) => {
  const { width, height } = useWindowDimensions();
  const drop = height + 80;
  const cycle = Math.min(Math.max(durationMs * 0.5, 1400), 2600);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {seeds.map((i) => (
        <FallParticle
          key={i}
          glyph={glyphs[i % glyphs.length]}
          index={i}
          count={count}
          cycleMs={cycle}
          drop={drop}
          width={width}
        />
      ))}
    </View>
  );
});

/* ------------------------------------------------------------------ *
 * Tier effects
 * ------------------------------------------------------------------ */

const COINS = ["🪙", "💰", "🟡"];
const CONFETTI = ["🎊", "🎉", "✨", "🔴", "🔵", "🟢"];

/** Gold wash with a siren pulse riding on top. */
const GoldenScreenEffect = memo(({ item }: { item: TipAnimationItem }) => {
  const hold = useHold(item.durationMs);
  const pulse = useSharedValue(0.25);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.75, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const siren = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View pointerEvents="none" className="absolute inset-0" style={hold}>
      <View className="absolute inset-0 bg-amber-300/35" />
      <Animated.View className="absolute inset-0 bg-yellow-400/35" style={siren} />
      <Rain glyphs={COINS} count={item.tier === "gold3" ? 14 : 20} durationMs={item.durationMs} />
    </Animated.View>
  );
});

/** Confetti plus a disco ball swinging in from the top. */
const PartyEffect = memo(({ item }: { item: TipAnimationItem }) => {
  const hold = useHold(item.durationMs);
  return (
    <Animated.View pointerEvents="none" className="absolute inset-0" style={hold}>
      <Rain glyphs={CONFETTI} count={18} durationMs={item.durationMs} />
      <DiscoBall durationMs={item.durationMs} />
    </Animated.View>
  );
});

/** The ball that swings in from the top on the party and ultimate tiers. */
const DiscoBall = memo(({ durationMs }: { durationMs: number }) => {
  const swing = useSharedValue(0);
  useEffect(() => {
    swing.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [swing]);
  const ball = useAnimatedStyle(() => ({ transform: [{ rotate: `${-18 + swing.value * 36}deg` }] }));
  return (
    <View className="absolute inset-x-0 top-0 items-center">
      <Animated.View style={[{ transformOrigin: "top" } as any, ball]}>
        <Text style={{ fontSize: 44 }}>🪩</Text>
      </Animated.View>
    </View>
  );
});

/** A shield wall crossing the lower third, each shield bobbing as it marches. */
const SpartansEffect = memo(({ item }: { item: TipAnimationItem }) => {
  const { width } = useWindowDimensions();
  const hold = useHold(item.durationMs);
  const march = useSharedValue(0);
  useEffect(() => {
    march.value = withTiming(1, { duration: item.durationMs, easing: Easing.linear });
  }, [march, item.durationMs]);
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -width * 0.5 + march.value * width * 1.6 }] }));

  return (
    <Animated.View pointerEvents="none" className="absolute inset-0 justify-end pb-24" style={hold}>
      <Animated.View className="flex-row items-end" style={row}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Shield key={i} index={i} />
        ))}
      </Animated.View>
      <View className="items-center mt-3">
        <SpartansPill amount={item.amount} />
      </View>
    </Animated.View>
  );
});

/** The banner under the shield wall. Split out so the row itself stays static. */
const SpartansPill = memo(({ amount }: { amount: number }) => {
  const { t } = useTranslation();
  return <Pill text={t("liveGift.tier.spartans", "Spartans Army")} extra={`${amount.toLocaleString()} DHB`} />;
});

const Shield = memo(({ index }: { index: number }) => {
  const step = useSharedValue(0);
  useEffect(() => {
    step.value = withDelay(
      index * 70,
      withRepeat(withTiming(1, { duration: 620 + (index % 3) * 60, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [step, index]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -step.value * 10 }, { rotate: `${-4 + step.value * 8}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Text style={{ fontSize: 34, marginHorizontal: 2 }}>🛡️</Text>
    </Animated.View>
  );
});

/** A glyph that lands in the middle and settles. */
const CenterGlyphEffect = memo(({ item, glyph, rings }: { item: TipAnimationItem; glyph: string; rings?: boolean }) => {
  const hold = useHold(item.durationMs);
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withSequence(
      withTiming(1.15, { duration: 320, easing: Easing.out(Easing.back(2)) }),
      withTiming(0.97, { duration: 160 }),
      withTiming(1, { duration: 140 }),
    );
  }, [pop]);
  const glyphStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { translateY: (1 - Math.min(pop.value, 1)) * 40 }],
  }));

  return (
    <Animated.View pointerEvents="none" className="absolute inset-0 items-center justify-center" style={hold}>
      {rings && [0, 1, 2].map((i) => <Ring key={i} index={i} />)}
      <Animated.View style={glyphStyle}>
        <Text style={{ fontSize: 84 }}>{glyph}</Text>
      </Animated.View>
    </Animated.View>
  );
});

const Ring = memo(({ index }: { index: number }) => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(index * 260, withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1, false));
  }, [p, index]);
  const style = useAnimatedStyle(() => ({
    opacity: (1 - p.value) * 0.85,
    transform: [{ scale: 0.2 + p.value * 2.4 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: "rgba(216,180,254,0.9)" },
        style,
      ]}
    />
  );
});

/** Flowers thrown out of the bottom-right corner in a fan. */
const BouquetEffect = memo(({ item }: { item: TipAnimationItem }) => {
  const hold = useHold(item.durationMs);
  return (
    <Animated.View pointerEvents="none" className="absolute inset-0" style={hold}>
      <View style={{ position: "absolute", right: 60, bottom: 90 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Petal key={i} index={i} />
        ))}
      </View>
    </Animated.View>
  );
});

const PETALS = ["🌸", "🌹", "💐", "🌷"];

const Petal = memo(({ index }: { index: number }) => {
  const angle = Math.PI + (Math.PI / 2) * (index / 9); // up-and-left quarter
  const reach = 110 + jitter(index + 1, 5) * 120;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(index * 45, withTiming(1, { duration: 1400 + jitter(index + 1, 11) * 800, easing: Easing.out(Easing.quad) }));
  }, [p, index]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value > 0.7 ? (1 - p.value) / 0.3 : Math.min(p.value / 0.2, 1),
    transform: [
      { translateX: Math.cos(angle) * reach * p.value },
      { translateY: Math.sin(angle) * reach * p.value },
      { scale: 0.2 + p.value },
      { rotate: `${(jitter(index + 1, 13) - 0.5) * 360 * p.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[{ position: "absolute" }, style]} pointerEvents="none">
      <Text style={{ fontSize: 28 }}>{PETALS[index % PETALS.length]}</Text>
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

/** How many corner emoji a tier is worth. */
const FLOAT_COUNT: Record<TipTierKey, number> = {
  heart: 8,
  chocolate: 9,
  bouquet: 8,
  crown: 9,
  magicRing: 9,
  spartans: 10,
  party: 11,
  gold3: 11,
  gold10: 14,
  ultimate: 16,
};

const TierEffect = memo(({ item }: { item: TipAnimationItem }) => {
  switch (item.tier) {
    case "ultimate":
      return (
        /* Everything at once, minus a second rain: the gold wash already
           carries 20 falling coins, and stacking confetti on top of it put
           ~55 animated layers over a decoding video for the rarest tier on
           the ladder. Gold, coins, disco ball, trophy. */
        <>
          <GoldenScreenEffect item={item} />
          <DiscoBall durationMs={item.durationMs} />
          <CenterGlyphEffect item={item} glyph="🏆" />
        </>
      );
    case "gold10":
    case "gold3":
      return <GoldenScreenEffect item={item} />;
    case "party":
      return <PartyEffect item={item} />;
    case "spartans":
      return <SpartansEffect item={item} />;
    case "magicRing":
      return <CenterGlyphEffect item={item} glyph="💍" rings />;
    case "crown":
      return <CenterGlyphEffect item={item} glyph="👑" />;
    case "bouquet":
      return <BouquetEffect item={item} />;
    case "chocolate":
    case "heart":
    default:
      return null;
  }
});

/**
 * The caption is the only part that says who paid and how much — the effect on
 * its own reads as decoration. Anchored bottom-LEFT so it never sits under the
 * emoji climbing the right-hand side.
 */
const Caption = memo(({ item }: { item: TipAnimationItem }) => {
  const { t } = useTranslation();
  const hold = useHold(item.durationMs);
  const spec = tierByKey(item.tier);
  const who = item.username ? `${item.username} • ` : "";
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 12, bottom: 96, maxWidth: "55%" }, hold]}>
      <View className="rounded-xl bg-black/60 border border-white/10 px-3 py-2">
        <Text className="text-white text-xs font-semibold">
          {spec.emoji} {t(`liveGift.tier.${spec.key}`, spec.name)}
        </Text>
        <Text className="text-white/70 text-[11px]">
          {who}
          {item.amount.toLocaleString()} DHB
        </Text>
        {item.message ? (
          <Text className="text-white/80 text-[11px] mt-0.5" numberOfLines={2}>
            {item.message}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
});

const Celebration = memo(({ item }: { item: TipAnimationItem }) => {
  const spec = tierByKey(item.tier);
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <TierEffect item={item} />
      <CornerFloat emoji={spec.emoji} count={FLOAT_COUNT[item.tier] ?? 8} durationMs={item.durationMs} />
      <Caption item={item} />
    </View>
  );
});

const TipAnimationsOverlay: React.FC<Props> = ({ items }) => {
  if (!items.length) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0">
      {items.map((item) => (
        <Celebration key={item.id} item={item} />
      ))}
    </View>
  );
};

export default memo(TipAnimationsOverlay);
