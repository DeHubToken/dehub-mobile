/**
 * BadgeAscension — the promotion ceremony.
 *
 * The badge lifts out of the username, evolves in the middle of the screen and
 * flies back to its slot one tier higher. It is a shared-element transition,
 * not a banner dropped on top: the thing that changed is the thing the holder
 * was already looking at.
 *
 * Everything runs off a single `progress` shared value on the UI thread, so a
 * busy JS thread — a profile still resolving its feed, say — cannot stutter
 * it. Nothing crosses the bridge between the first frame and the last.
 *
 * No Skia here (it would mean a native build, and the ceremony would be stuck
 * behind a store release instead of riding the next OTA), so the shatter beat
 * cuts the artwork into rectangles with overflow-hidden tiles rather than the
 * wedges the web canvas clips. Same badge breaking apart, squarer pieces.
 *
 * Every effect is white on black. The badge artwork stays the only colour on
 * screen, which is what keeps the top-tier fireworks cinematic rather than
 * gaudy.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, View, Image } from "react-native";
import Animated, {
  type SharedValue,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { badgeThreshold } from "../../libs/misc";
import {
  BEATS,
  EMBER_COUNT,
  SPARKS_PER_BURST,
  badgeMotion,
  shortDhb,
} from "../../libs/badgeMotion";

import { DhbCoin } from "../common/DhbCoin";

export interface BadgeSlot {
  /** Window coordinates of the badge beside the username. */
  x: number;
  y: number;
  size: number;
}

interface Props {
  from: string | undefined;
  to: string;
  slot: BadgeSlot | null;
  balance?: number | null;
  onDone: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const HERO_R = Math.max(50, Math.min(Math.min(SCREEN_W, SCREEN_H) * 0.155, 88));
const HERO_X = SCREEN_W / 2;
const HERO_Y = SCREEN_H * 0.42;

/** Fraction of the way through a beat. */
function beat(p: number, b: readonly [number, number]) {
  "worklet";
  return Math.min(1, Math.max(0, (p - b[0]) / (b[1] - b[0])));
}
function outCubic(x: number) {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}
function inOutCubic(x: number) {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function outBack(x: number) {
  "worklet";
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

/** Where the ceremony stops and waits for the holder. */
const HOLD_AT = BEATS.name[1];
/** The trip home, once they ask for it. */
const RETURN_MS = 760;

export default function BadgeAscension({ from, to, slot, balance, onDone }: Props) {
  const { t, i18n } = useTranslation();
  const motion = useMemo(() => badgeMotion(to), [to]);
  const prior = useMemo(() => badgeMotion(from), [from]);
  const threshold = useMemo(() => badgeThreshold(to), [to]);
  const progress = useSharedValue(0);
  /** True once the timed beats are done and it is waiting on the holder. */
  const [holding, setHolding] = useState(false);

  const start = slot ?? { x: HERO_X, y: SCREEN_H * 0.22, size: 22 };
  const startR = start.size / 2;

  /** Deterministic per-particle jitter — seeded once so a re-render cannot
   *  reshuffle a burst mid-flight. */
  const motes = useMemo(
    () =>
      Array.from({ length: motion?.motes ?? 0 }, () => ({
        angle: Math.random() * Math.PI * 2,
        spread: 0.38 + Math.random() * 0.85,
        size: 1.6 + Math.random() * 3,
        lag: Math.random() * 0.42,
        swirl: (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 1.7),
      })),
    [motion?.motes],
  );

  const shards = useMemo(() => {
    const g = motion && prior ? prior.shardGrid : 3;
    return Array.from({ length: g * g }, (_, i) => {
      const col = i % g;
      const row = Math.floor(i / g);
      // Push each tile away from the centre of the grid it was cut from.
      const dx = (col + 0.5) / g - 0.5;
      const dy = (row + 0.5) / g - 0.5;
      const len = Math.max(0.12, Math.hypot(dx, dy));
      return {
        col,
        row,
        grid: g,
        vx: (dx / len) * (2 + Math.random() * 2),
        vy: (dy / len) * (2 + Math.random() * 2) - 0.3,
        spin: (Math.random() - 0.5) * 240,
        grav: 0.9 + Math.random() * 1.4,
        lag: Math.random() * 0.18,
      };
    });
  }, [motion, prior]);

  const sparks = useMemo(() => {
    if (!motion?.fx.fireworks) return [];
    return Array.from({ length: motion.fx.fireworks }, (_, b) => {
      const bx = 0.18 + Math.random() * 0.64;
      const by = 0.16 + Math.random() * 0.32;
      const at = 0.6 + (b * 0.28) / motion.fx.fireworks;
      return Array.from({ length: SPARKS_PER_BURST }, () => {
        const a = Math.random() * Math.PI * 2;
        const v = 0.1 + Math.random() * 0.07;
        return {
          bx,
          by,
          t0: at,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.16 + Math.random() * 0.12,
          size: 2 + Math.random() * 2.5,
        };
      });
    }).flat();
  }, [motion?.fx.fireworks]);

  const embers = useMemo(() => {
    if (!motion?.fx.embers) return [];
    return Array.from({ length: EMBER_COUNT }, () => ({
      x: Math.random(),
      y: 0.2 + Math.random() * 0.5,
      t0: 0.66 + Math.random() * 0.18,
      drift: (Math.random() - 0.5) * 0.05,
      fall: 0.06 + Math.random() * 0.1,
      size: 1.6 + Math.random() * 2,
    }));
  }, [motion?.fx.embers]);

  useEffect(() => {
    if (!motion) {
      onDone();
      return;
    }
    // The timed beats run to the end of the name beat and stop there. The trip
    // home is not played until the holder asks for it — read at a glance, the
    // last beat was gone before anyone finished the line, and a tier is earned
    // once.
    progress.value = 0;
    progress.value = withTiming(
      HOLD_AT,
      { duration: Math.round(motion.durationMs * HOLD_AT), easing: Easing.linear },
      (done) => {
        if (done) runOnJS(setHolding)(true);
      },
    );
    // onDone is stable enough for one ceremony; restarting on its identity
    // would replay the animation from zero mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion]);

  /**
   * A tap during the ceremony skips to the end of it rather than dismissing:
   * someone who taps early wants the answer sooner, not to lose it. Only a tap
   * once it is holding sends the badge home.
   */
  const requestReturn = useCallback(() => {
    if (!holding) {
      progress.value = withTiming(HOLD_AT, { duration: 220, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(setHolding)(true);
      });
      return;
    }
    setHolding(false);
    progress.value = withTiming(1, { duration: RETURN_MS, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done) runOnJS(onDone)();
    });
    // onDone is read once, at the end of the ceremony it closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  /* ---------- the badge in flight ---------- */
  const badgeStyle = useAnimatedStyle(() => {
    const p = progress.value;
    let x = HERO_X;
    let y = HERO_Y;
    let r = HERO_R;
    let opacity = 1;

    if (p < BEATS.lift[1]) {
      const e = inOutCubic(beat(p, BEATS.lift));
      x = interpolate(e, [0, 1], [start.x, HERO_X]);
      y = interpolate(e, [0, 1], [start.y, HERO_Y]) - Math.sin(e * Math.PI) * Math.min(78, SCREEN_H * 0.11);
      r = interpolate(e, [0, 1], [startR, HERO_R]);
    } else if (p < BEATS.shatter[0]) {
      // Charge: it contracts, and the bloom behind it comes up.
      r = HERO_R * (1 - 0.14 * Math.pow(beat(p, BEATS.charge), 2));
    } else if (p < BEATS.form[0]) {
      // Shattered. The tiles carry the image through this stretch.
      opacity = 0;
    } else if (p < BEATS.ret[0]) {
      const f = beat(p, BEATS.form);
      const push = motion?.fx.push ? 1 + 0.1 * outCubic(Math.min(1, (p - BEATS.form[0]) / (1 - BEATS.form[0]))) : 1;
      r = HERO_R * push * (f < 1 ? 0.3 + 0.7 * outBack(f) : 1);
      opacity = Math.min(1, f * 2.4);
    } else {
      const e = inOutCubic(beat(p, BEATS.ret));
      x = interpolate(e, [0, 1], [HERO_X, start.x]);
      y = interpolate(e, [0, 1], [HERO_Y, start.y]) - Math.sin(e * Math.PI) * Math.min(78, SCREEN_H * 0.11);
      r = interpolate(e, [0, 1], [HERO_R, startR]);
    }

    return {
      opacity,
      width: r * 2,
      height: r * 2,
      transform: [{ translateX: x - r }, { translateY: y - r }],
    };
  });

  /** The bloom behind the badge — one view doing the work of a gradient. */
  const bloomStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const charge = beat(p, BEATS.charge);
    const form = beat(p, BEATS.form);
    let a = 0.1;
    if (p < BEATS.shatter[0]) a = 0.12 + 0.5 * charge;
    else if (p < BEATS.form[0]) a = 0.5 * (1 - beat(p, BEATS.shatter));
    else if (p < BEATS.ret[0]) a = (0.3 + 0.45 * (motion?.intensity ?? 0)) * (1 - form * 0.6);
    else a = 0.25 * (1 - beat(p, BEATS.ret));
    return { opacity: Math.max(0, a) };
  });

  const backdropStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const deep = motion?.fx.vignette ? 0.96 : 0.86;
    const inA = beat(p, BEATS.lift);
    const outA = beat(p, BEATS.ret);
    return { opacity: p < BEATS.lift[1] ? deep * inA : deep * (1 - outA) };
  });

  const flashStyle = useAnimatedStyle(() => {
    if (!motion?.fx.flash) return { opacity: 0 };
    const p = progress.value;
    const a = Math.max(0, 1 - (p - BEATS.form[0]) / 0.05);
    return { opacity: p >= BEATS.form[0] ? 0.42 * a * a : 0 };
  });

  const streakStyle = useAnimatedStyle(() => {
    if (!motion?.fx.streak) return { opacity: 0, transform: [{ scaleX: 0 }] };
    const p = progress.value;
    const f = beat(p, BEATS.form);
    const on = p >= BEATS.form[0] && p < BEATS.wave[1];
    return {
      opacity: on ? Math.sin(Math.min(1, f) * Math.PI) * 0.85 : 0,
      transform: [{ scaleX: 0.4 + f * 1.3 }],
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    if (!motion?.fx.halo) return { opacity: 0 };
    const p = progress.value;
    const c = beat(p, BEATS.converge);
    const on = p >= BEATS.converge[0] && p < BEATS.ret[0];
    return {
      opacity: on ? 0.16 * Math.min(1, c * 1.5) : 0,
      transform: [{ scale: 0.6 + outCubic(Math.min(1, c)) * 1.5 }],
    };
  });

  const captionStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const e = p >= BEATS.name[0] ? outCubic(beat(p, BEATS.name)) : 0;
    const out = p >= BEATS.ret[0] ? 1 - outCubic(beat(p, BEATS.ret)) : 1;
    return { opacity: e * out, transform: [{ translateY: (1 - e) * 16 }] };
  });

  if (!motion) return null;

  const balanceText =
    typeof balance === "number" && Number.isFinite(balance)
      ? new Intl.NumberFormat(i18n.language).format(Math.floor(balance))
      : null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      <Pressable style={StyleSheet.absoluteFill} onPress={requestReturn} accessibilityRole="button">
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} pointerEvents="none" />

        {motion.fx.halo && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              { left: HERO_X - HERO_R * 3, top: HERO_Y - HERO_R * 3, width: HERO_R * 6, height: HERO_R * 6, borderRadius: HERO_R * 3 },
              haloStyle,
            ]}
          />
        )}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.bloom,
            { left: HERO_X - HERO_R * 2, top: HERO_Y - HERO_R * 2, width: HERO_R * 4, height: HERO_R * 4, borderRadius: HERO_R * 2 },
            bloomStyle,
          ]}
        />

        {motes.map((m, i) => (
          <Mote key={`m${i}`} p={progress} spec={m} />
        ))}

        {prior?.asset != null &&
          shards.map((s, i) => <Shard key={`s${i}`} p={progress} spec={s} asset={prior.asset as number} />)}

        {sparks.map((s, i) => (
          <Spark key={`f${i}`} p={progress} spec={s} />
        ))}
        {embers.map((e, i) => (
          <Ember key={`e${i}`} p={progress} spec={e} />
        ))}

        <Animated.View pointerEvents="none" style={[styles.badge, badgeStyle]}>
          {motion.asset != null && <Image source={motion.asset} style={styles.fill} resizeMode="contain" />}
        </Animated.View>

        {motion.fx.streak && (
          <Animated.View
            pointerEvents="none"
            style={[styles.streak, { top: HERO_Y - 1, left: HERO_X - SCREEN_W / 2, width: SCREEN_W }, streakStyle]}
          />
        )}

        {[0, 1, 2].slice(0, motion.shockwaves).map((i) => (
          <Shockwave key={`w${i}`} p={progress} index={i} />
        ))}

        <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />

        <Animated.View pointerEvents="none" style={[styles.caption, captionStyle]}>
          <Text style={[styles.hype, motion.rank >= 12 && styles.hypeCrown]}>{t(motion.lineKey)}</Text>
          <Text style={styles.tier}>{motion.tier}</Text>
          {threshold != null && (
            <View style={styles.chip}>
              <DhbCoin size={20} />
              <Text style={styles.chipText}>{shortDhb(threshold)}</Text>
              <View style={styles.rule} />
              <Svg width={14} height={14} viewBox="0 0 16 16">
                <Path
                  d="M2.5 8.5L6 12L13.5 4"
                  stroke="#ffffff"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>
          )}
          {balanceText && (
            <Text style={styles.balance}>{t("badgeAscension.yourBalance", { amount: balanceText })}</Text>
          )}
          {/* The way out. It arrives only once the ceremony is waiting, so it
              never competes with the beats for attention. */}
          {holding && (
            <Pressable style={styles.cta} onPress={requestReturn} accessibilityRole="button">
              <Text style={styles.ctaText}>{t("badgeAscension.continue")}</Text>
            </Pressable>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function Mote({ p, spec }: { p: SharedValue<number>; spec: { angle: number; spread: number; size: number; lag: number; swirl: number } }) {
  const far = Math.max(SCREEN_W, SCREEN_H) * 0.85;
  const style = useAnimatedStyle(() => {
    const conv = beat(p.value, BEATS.converge);
    const lp = Math.min(1, Math.max(0, (conv - spec.lag) / (1 - spec.lag)));
    if (lp <= 0 || p.value >= BEATS.form[1]) return { opacity: 0 };
    const e = outCubic(lp);
    const d = far * spec.spread * (1 - e);
    const a = spec.angle + spec.swirl * e * 1.25;
    return {
      opacity: lp > 0.9 ? (1 - lp) / 0.1 : 0.9,
      transform: [
        { translateX: HERO_X + Math.cos(a) * d - spec.size / 2 },
        { translateY: HERO_Y + Math.sin(a) * d - spec.size / 2 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dot, { width: spec.size, height: spec.size, borderRadius: spec.size / 2 }, style]}
    />
  );
}

/**
 * One tile of the outgoing badge. The wrapper is a window onto the artwork;
 * the image inside is full size and offset, so the tiles together reproduce
 * the badge exactly before they fly apart.
 */
function Shard({
  p,
  spec,
  asset,
}: {
  p: SharedValue<number>;
  spec: { col: number; row: number; grid: number; vx: number; vy: number; spin: number; grav: number; lag: number };
  asset: number;
}) {
  const tile = (HERO_R * 2) / spec.grid;
  const style = useAnimatedStyle(() => {
    const s = beat(p.value, BEATS.shatter);
    const lp = Math.min(1, Math.max(0, (s - spec.lag) / (1 - spec.lag)));
    if (p.value < BEATS.shatter[0] || p.value >= BEATS.form[0] || lp <= 0) return { opacity: 0 };
    const e = outCubic(lp);
    const homeX = HERO_X - HERO_R + spec.col * tile;
    const homeY = HERO_Y - HERO_R + spec.row * tile;
    return {
      opacity: (1 - e * e) * 0.95,
      transform: [
        { translateX: homeX + spec.vx * HERO_R * e },
        { translateY: homeY + spec.vy * HERO_R * e + spec.grav * HERO_R * e * e * 0.9 },
        { rotate: `${spec.spin * e}deg` },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.shard, { width: tile, height: tile }, style]}>
      <Image
        source={asset}
        resizeMode="contain"
        style={{
          width: HERO_R * 2,
          height: HERO_R * 2,
          marginLeft: -spec.col * tile,
          marginTop: -spec.row * tile,
        }}
      />
    </Animated.View>
  );
}

function Shockwave({ p, index }: { p: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const w = beat(p.value, BEATS.wave);
    const wp = Math.min(1, Math.max(0, (w - index * 0.15) / (1 - index * 0.15)));
    if (p.value < BEATS.wave[0] || wp <= 0 || wp >= 1) return { opacity: 0 };
    return {
      opacity: (1 - wp) * 0.42,
      transform: [{ scale: 1.05 + outCubic(wp) * 5.4 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        { left: HERO_X - HERO_R, top: HERO_Y - HERO_R, width: HERO_R * 2, height: HERO_R * 2, borderRadius: HERO_R },
        style,
      ]}
    />
  );
}

function Spark({
  p,
  spec,
}: {
  p: SharedValue<number>;
  spec: { bx: number; by: number; t0: number; vx: number; vy: number; life: number; size: number };
}) {
  const style = useAnimatedStyle(() => {
    const age = p.value - spec.t0;
    if (age <= 0 || age > spec.life) return { opacity: 0 };
    const u = age / spec.life;
    const tt = age * 10;
    return {
      opacity: (1 - u) * (1 - u),
      transform: [
        { translateX: (spec.bx + spec.vx * tt) * SCREEN_W },
        { translateY: (spec.by + spec.vy * tt + 0.085 * tt * tt) * SCREEN_H },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dot, { width: spec.size, height: spec.size, borderRadius: spec.size / 2 }, style]}
    />
  );
}

function Ember({
  p,
  spec,
}: {
  p: SharedValue<number>;
  spec: { x: number; y: number; t0: number; drift: number; fall: number; size: number };
}) {
  const style = useAnimatedStyle(() => {
    const age = p.value - spec.t0;
    if (age <= 0) return { opacity: 0 };
    const u = Math.min(1, age / (1 - spec.t0));
    return {
      opacity: (1 - u) * 0.55,
      transform: [
        { translateX: (spec.x + spec.drift * age) * SCREEN_W },
        { translateY: (spec.y + spec.fall * age * 2.2) * SCREEN_H },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dot, { width: spec.size, height: spec.size, borderRadius: spec.size / 2 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "#000000" },
  fill: { width: "100%", height: "100%" },
  badge: { position: "absolute", left: 0, top: 0 },
  shard: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  dot: { position: "absolute", left: 0, top: 0, backgroundColor: "#ffffff" },
  bloom: { position: "absolute", backgroundColor: "rgba(255,255,255,0.10)" },
  halo: { position: "absolute", backgroundColor: "rgba(255,255,255,0.06)" },
  ring: { position: "absolute", borderWidth: 1.5, borderColor: "#ffffff" },
  streak: { position: "absolute", height: 2, backgroundColor: "#ffffff" },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },
  caption: { position: "absolute", left: 20, right: 20, bottom: SCREEN_H * 0.14, alignItems: "center" },
  hype: {
    color: "#d4d4d8",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  hypeCrown: { color: "#ffffff", fontSize: 15, letterSpacing: 2 },
  tier: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.5,
    textTransform: "uppercase",
    marginTop: 4,
    textAlign: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 5,
    paddingLeft: 7,
    paddingRight: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chipText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  rule: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.2)" },
  balance: { color: "#808089", fontSize: 12.5, marginTop: 8 },
  cta: {
    marginTop: 24,
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  ctaText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
});
