/**
 * Ascension — the promotion ceremony, played as the opening of the badge
 * showcase.
 *
 * A tap opens the showcase by flying the badge out of the name and waking it
 * up as a sticker. A promotion does the same trip with a detour: the old
 * badge flies out, shivers, bursts into holo glitter, the glitter swirls back
 * in and pops out as the new badge — landing exactly where the sticker will
 * take over, so the sticker's own reveal finishes the moment. Web's twin is
 * dehubweb `src/components/app/badge-showcase/ascension.ts`.
 *
 * The web draws the glitter on a canvas. There is no Skia here (see
 * `libs/badgeMotion`), so every flake, wedge, streak and ring is a view, all
 * driven off one clock on the UI thread; the old art breaks into rectangles
 * rather than the canvas's wedges. Glitter is the sticker burst's palette —
 * white with a pastel holo tint — so the ceremony and the sticker read as
 * one thing. Per-tier sizing comes from `badgeMotion`.
 */
import React, { useCallback, useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import type { StickerArt } from "./BadgeSticker";
import { EMBER_COUNT, SPARKS_PER_BURST, type BadgeMotion } from "../../libs/badgeMotion";
import { haptic } from "../../libs/haptics";

export interface AscensionBox {
  x: number;
  y: number;
  size: number;
}

interface Props {
  /** Where the old badge sits on screen, or null when it could not be measured. */
  from: AscensionBox | null;
  /** Where the sticker's art will sit. */
  hero: AscensionBox;
  /** The outgoing badge. Null for someone's first badge. */
  fromArt: StickerArt | null;
  toArt: StickerArt;
  /** Resting tilt of the sticker, degrees. */
  restTilt: number;
  motion: BadgeMotion;
  /** Landed: stop catching taps and let the tail play out underneath. */
  landed: boolean;
  /** The new badge sits on the hero box: hand over to the sticker. */
  onLanded: () => void;
  /** Everything has settled; unmount. */
  onFinished: () => void;
}

const TAU = Math.PI * 2;

function clamp01(x: number) {
  "worklet";
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function outCubic(x: number) {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}
function inOutCubic(x: number) {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function outBack(x: number, c: number) {
  "worklet";
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}
function lerp(a: number, b: number, t: number) {
  "worklet";
  return a + (b - a) * t;
}

/** The sticker burst's tint: a cosine rainbow washed toward white. */
function holo(hue: number, wash: number, alpha: number) {
  "worklet";
  const r = Math.round(255 * lerp(1, 0.5 + 0.5 * Math.cos(TAU * hue), wash));
  const g = Math.round(255 * lerp(1, 0.5 + 0.5 * Math.cos(TAU * (hue + 0.33)), wash));
  const b = Math.round(255 * lerp(1, 0.5 + 0.5 * Math.cos(TAU * (hue + 0.67)), wash));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Timeline, ms from the start. Identical to the web ceremony's. */
function timeline(motion: BadgeMotion, hasOld: boolean) {
  const i = motion.intensity;
  const LIFT = hasOld ? 760 : 0;
  const CHARGE = hasOld ? Math.round(460 + 280 * i) : 0;
  const POP = LIFT + CHARGE;
  const OUT = 620;
  const SWIRL = Math.round(820 + 620 * i);
  const SWIRL_AT = POP + (hasOld ? OUT * 0.55 : 180);
  const FORM = SWIRL_AT + SWIRL;
  const SETTLE = 560;
  const LAND = FORM + SETTLE;
  const TAIL = LAND + (motion.fx.embers ? 2600 : motion.fx.fireworks ? 1500 : 600);
  return { i, hasOld, LIFT, CHARGE, POP, OUT, SWIRL, SWIRL_AT, FORM, SETTLE, LAND, TAIL };
}
type Timeline = ReturnType<typeof timeline>;

/** Where everything gathers: the middle of the hero box. */
interface Center {
  cx: number;
  cy: number;
  R: number;
}

/** How long the ceremony's copy of the new badge lingers over the sticker. */
const HANDOFF_MS = 220;

export default function Ascension({ from, hero, fromArt, toArt, restTilt, motion, landed, onLanded, onFinished }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const tl = useMemo(() => timeline(motion, !!fromArt), [motion, fromArt]);
  const c = useMemo<Center>(() => ({ cx: hero.x + hero.size / 2, cy: hero.y + hero.size / 2, R: hero.size / 2 }), [hero.x, hero.y, hero.size]);
  const clock = useSharedValue(0);

  useEffect(() => {
    clock.value = withTiming(tl.LAND, { duration: tl.LAND, easing: Easing.linear }, (done) => {
      if (!done) return;
      runOnJS(onLanded)();
      clock.value = withTiming(tl.TAIL, { duration: tl.TAIL - tl.LAND, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(onFinished)();
      });
    });
    const timers = [setTimeout(haptic.success, tl.FORM)];
    if (tl.hasOld) timers.push(setTimeout(haptic.press, tl.POP));
    return () => {
      cancelAnimation(clock);
      timers.forEach(clearTimeout);
    };
    // Plays once; the shell unmounts it to stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A tap skips to the new badge rather than closing the showcase. */
  const skip = useCallback(() => {
    cancelAnimation(clock);
    onLanded();
    onFinished();
  }, [clock, onLanded, onFinished]);

  /* ---------- particles, seeded once so a re-render never reshuffles them ---------- */

  const shards = useMemo(() => {
    if (!fromArt) return [];
    const g = motion.shardGrid;
    return Array.from({ length: g * g }, (_, k) => {
      const col = k % g;
      const row = Math.floor(k / g);
      // Thrown away from the middle of the badge they were cut from.
      const dx = (col + 0.5) / g - 0.5;
      const dy = (row + 0.5) / g - 0.5;
      const len = Math.max(0.12, Math.hypot(dx, dy));
      const throwOut = 1.6 + Math.random() * 1.6;
      return {
        col,
        row,
        grid: g,
        dx: (dx / len) * throwOut,
        dy: (dy / len) * throwOut - 0.35,
        spin: (Math.random() - 0.5) * 340,
        lag: Math.random() * 0.15,
        grav: 0.8 + Math.random() * 1.3,
      };
    });
  }, [fromArt, motion.shardGrid]);

  // The glitter the old badge bursts into, which is also what the new one is
  // made of: every flake flies out, hangs, then spirals back in.
  const flakes = useMemo(
    () =>
      Array.from({ length: Math.round(28 + tl.i * 32) }, (_, k) => ({
        k,
        a0: Math.random() * TAU,
        out: 0.7 + Math.random() * 1.9,
        lag: Math.random() * 0.4,
        swirl: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.4),
        size: 2 + Math.random() * 3.2,
        rot: Math.random() * TAU,
        rotV: (Math.random() - 0.5) * 14,
        hue: Math.random(),
        star: Math.random() < 0.22,
      })),
    [tl.i],
  );

  // Drawn in from off screen, with trails, so the swirl fills the screen on
  // the big tiers rather than staying a ring around the badge.
  const motes = useMemo(
    () =>
      Array.from({ length: Math.round(motion.motes * 0.4) }, () => ({
        a0: Math.random() * TAU,
        spread: 0.45 + Math.random() * 0.75,
        lag: Math.random() * 0.4,
        swirl: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.5),
        r: 1 + Math.random() * 1.6,
        color: holo(Math.random(), 0.3, 1),
      })),
    [motion.motes],
  );

  // Glitter bursts around the stage as the top tiers land, then a slow fall.
  const pops = useMemo(
    () =>
      Array.from({ length: motion.fx.fireworks }, (_, b) => {
        const bx = 0.14 + Math.random() * 0.72;
        const by = 0.12 + Math.random() * 0.4;
        const at = tl.FORM + 80 + b * 170 + Math.random() * 60;
        return Array.from({ length: SPARKS_PER_BURST }, () => {
          const a = Math.random() * TAU;
          const v = 90 + Math.random() * 170;
          return {
            bx,
            by,
            at,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 900 + Math.random() * 700,
            size: 1.8 + Math.random() * 2.4,
            rot: Math.random() * TAU,
            rotV: (Math.random() - 0.5) * 12,
            hue: Math.random(),
          };
        });
      }).flat(),
    [motion.fx.fireworks, tl.FORM],
  );

  const fall = useMemo(
    () =>
      motion.fx.embers
        ? Array.from({ length: EMBER_COUNT }, () => ({
            x: Math.random(),
            y: -0.05 - Math.random() * 0.3,
            at: tl.FORM + Math.random() * 500,
            vy: 0.08 + Math.random() * 0.1,
            sway: Math.random() * TAU,
            size: 1.8 + Math.random() * 2.4,
            rot: Math.random() * TAU,
            rotV: (Math.random() - 0.5) * 6,
            hue: Math.random(),
          }))
        : [],
    [motion.fx.embers, tl.FORM],
  );

  /* ---------- the badges ---------- */

  const { cx, cy, R } = c;
  const start = from ?? { x: cx - R * 0.2, y: cy - R * 0.2, size: R * 0.4 };

  // Out of the name exactly like the showcase's own flight, then a shiver as
  // it charges up.
  const oldBadge = useAnimatedStyle(() => {
    const t = clock.value;
    if (!tl.hasOld || t >= tl.POP) return { opacity: 0 };
    const target = { x: cx - R * 0.62, y: cy - R * 0.62, size: R * 1.24 };
    let x = target.x;
    let y = target.y;
    let size = target.size;
    let rotate = restTilt;
    if (t < tl.LIFT) {
      const p = t / tl.LIFT;
      const move = outCubic(p);
      x = lerp(start.x, target.x, move);
      y = lerp(start.y, target.y, move) - Math.sin(p * Math.PI) * Math.min(80, H * 0.1);
      size = lerp(start.size, target.size, outBack(p, 1.7));
      rotate = restTilt + (1 - move) * -18;
    } else {
      const k = (t - tl.LIFT) / tl.CHARGE;
      size = target.size * (1 + 0.08 * Math.sin(k * Math.PI * 3) * k - 0.1 * k * k);
      x = target.x + (target.size - size) / 2;
      y = target.y + (target.size - size) / 2;
      rotate = restTilt + Math.sin(t * 0.06) * k * k * (4 + 6 * tl.i);
    }
    return { opacity: 1, width: size, height: size, transform: [{ translateX: x }, { translateY: y }, { rotateZ: `${rotate}deg` }] };
  });
  const oldGlow = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: t > tl.LIFT && t < tl.POP ? (t - tl.LIFT) / tl.CHARGE : 0 };
  });

  // Pops in from the glitter and settles to the sticker's resting tilt.
  const newBadge = useAnimatedStyle(() => {
    const t = clock.value;
    if (t < tl.FORM || t >= tl.LAND + HANDOFF_MS) return { opacity: 0 };
    const k = clamp01((t - tl.FORM) / tl.SETTLE);
    const size = hero.size * (0.25 + 0.75 * outBack(k, 1.9));
    return {
      opacity: t > tl.LAND ? 1 - (t - tl.LAND) / HANDOFF_MS : 1,
      width: size,
      height: size,
      transform: [
        { translateX: cx - size / 2 },
        { translateY: cy - size / 2 },
        { rotateZ: `${restTilt + (1 - outCubic(k)) * 24}deg` },
      ],
    };
  });
  const newGlow = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: t >= tl.FORM ? clamp01(1.2 * (1 - (t - tl.FORM) / tl.SETTLE)) : 0 };
  });

  /* ---------- light ---------- */

  // One soft bloom doing the work of the canvas's radial gradients: whichever
  // beat is brightest right now sets its size and strength.
  const bloom = useAnimatedStyle(() => {
    const t = clock.value;
    let r = 0;
    let a = 0;
    const take = (rr: number, aa: number) => {
      if (aa > a) {
        r = rr;
        a = aa;
      }
    };
    if (tl.hasOld && t > tl.LIFT && t < tl.POP) take(R * 0.62, ((t - tl.LIFT) / tl.CHARGE) * 0.9);
    if (tl.hasOld && t >= tl.POP && t < tl.POP + tl.OUT * 1.4) take(R * 0.7, (1 - (t - tl.POP) / (tl.OUT * 1.4)) * 1.1);
    if (t < tl.FORM + 120) {
      const g = clamp01((t - tl.SWIRL_AT) / tl.SWIRL);
      take(R * (0.4 + 0.5 * g), g * g * (0.8 + 0.6 * tl.i));
    }
    if (t >= tl.FORM) take(R, (1 - clamp01((t - tl.FORM) / tl.SETTLE)) * (0.9 + 0.9 * tl.i));
    return { opacity: clamp01(a / 1.2), transform: [{ scale: Math.max(0.01, r / R) }] };
  });

  const flash = useAnimatedStyle(() => {
    const t = clock.value;
    if (!motion.fx.flash || t < tl.FORM || t >= tl.FORM + 260) return { opacity: 0 };
    const fa = 1 - (t - tl.FORM) / 260;
    return { opacity: 0.22 * fa * fa };
  });

  // A light sweep across the new badge, like tilting a foil sticker.
  const sweep = useAnimatedStyle(() => {
    const t = clock.value;
    const s = inOutCubic(clamp01((t - tl.FORM - 120) / 520));
    if (!motion.fx.streak || t < tl.FORM || s <= 0 || s >= 1) return { opacity: 0 };
    const w = R * 2.4;
    const x = R * 0.98 - w / 2 + s * w;
    return { opacity: 0.5 * Math.sin(s * Math.PI), transform: [{ translateX: x - R * 0.5 }] };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={landed ? "none" : "box-none"}>
      {!landed && (
        <Pressable style={StyleSheet.absoluteFill} onPress={skip} importantForAccessibility="no" accessible={false} />
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.bloom,
          { left: cx - R * 2.4, top: cy - R * 2.4, width: R * 4.8, height: R * 4.8, borderRadius: R * 2.4 },
          bloom,
        ]}
      >
        <View style={[styles.bloomRing, { margin: R * 1.0, borderRadius: R * 1.4, backgroundColor: holo(0.6, 0.25, 0.08) }]} />
        <View style={[styles.bloomRing, { margin: R * 1.7, borderRadius: R * 0.7, backgroundColor: "rgba(255,255,255,0.16)" }]} />
      </Animated.View>

      {fromArt && (
        <Animated.View pointerEvents="none" style={[styles.badge, oldBadge]}>
          <Animated.View style={[styles.glow, oldGlow]}>{fromArt.renderPlate("#ffffff", 6)}</Animated.View>
          {fromArt.renderArt()}
        </Animated.View>
      )}

      <Animated.View pointerEvents="none" style={[styles.badge, newBadge]}>
        <Animated.View style={[styles.glow, newGlow]}>{toArt.renderPlate("#ffffff", 6)}</Animated.View>
        {toArt.renderArt()}
      </Animated.View>

      {motion.fx.streak && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: cx - R * 0.98,
            top: cy - R * 0.98,
            width: R * 1.96,
            height: R * 1.96,
            borderRadius: R * 0.98,
            overflow: "hidden",
          }}
        >
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: R, height: R * 1.96 }, sweep]}>
            <LinearGradient
              colors={["rgba(255,255,255,0)", "#ffffff", "rgba(255,255,255,0)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      )}

      {fromArt &&
        shards.map((s, k) => <Shard key={`s${k}`} clock={clock} tl={tl} c={c} spec={s} art={fromArt} restTilt={restTilt} />)}

      {motes.map((m, k) => (
        <Mote key={`m${k}`} clock={clock} tl={tl} c={c} spec={m} far={Math.max(W, H) * 0.75} />
      ))}

      {flakes.map((f, k) => (
        <SwirlFlake key={`f${k}`} clock={clock} tl={tl} c={c} spec={f} />
      ))}

      {Array.from({ length: motion.shockwaves }, (_, w) => (
        <Ring key={`w${w}`} clock={clock} tl={tl} c={c} index={w} />
      ))}

      {pops.map((p, k) => (
        <PopFlake key={`p${k}`} clock={clock} spec={p} W={W} H={H} />
      ))}
      {fall.map((e, k) => (
        <FallFlake key={`e${k}`} clock={clock} tl={tl} spec={e} W={W} H={H} />
      ))}

      <Animated.View pointerEvents="none" style={[styles.flash, flash]} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One glitter flake: a spinning diamond that catches the light as it turns.
 * `place` is the worklet that says where it is at a given moment.
 */
function Flake({
  clock,
  size,
  star,
  place,
}: {
  clock: SharedValue<number>;
  size: number;
  star: boolean;
  place: (t: number) => { x: number; y: number; rot: number; hue: number; alpha: number; scale: number } | null;
}) {
  const side = size * Math.SQRT2;
  const body = useAnimatedStyle(() => {
    const f = place(clock.value);
    if (!f || f.alpha <= 0.01) return { opacity: 0 };
    const glint = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(f.rot)), 3);
    return {
      opacity: f.alpha * (0.45 + 0.55 * glint),
      transform: [{ translateX: f.x }, { translateY: f.y }, { rotateZ: `${f.rot}rad` }, { scale: f.scale }],
    };
  });
  const tint = useAnimatedStyle(() => {
    const f = place(clock.value);
    if (!f) return {};
    const glint = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(f.rot)), 3);
    return { backgroundColor: holo(f.hue + f.rot * 0.05, 0.4 + 0.3 * glint, 1) };
  });
  const cross = useAnimatedStyle(() => {
    const f = place(clock.value);
    if (!f) return {};
    const glint = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(f.rot)), 3);
    return { transform: [{ scale: (1.4 + glint * 1.6) / 3 }] };
  });
  const arm = size * 3;
  return (
    <Animated.View pointerEvents="none" collapsable={false} style={[styles.flake, body]}>
      <Animated.View
        style={[
          { position: "absolute", left: -side / 2, top: -side / 2, width: side, height: side, transform: [{ scaleX: 0.62 }, { rotateZ: "45deg" }] },
          tint,
        ]}
      />
      {star && (
        <Animated.View style={[{ position: "absolute", left: -arm, top: -arm, width: arm * 2, height: arm * 2 }, cross]}>
          <View style={[styles.bar, { left: 0, top: arm - 0.6, width: arm * 2, height: 1.2 }]} />
          <View style={[styles.bar, { left: arm - 0.6, top: 0, width: 1.2, height: arm * 2 }]} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

function SwirlFlake({
  clock,
  tl,
  c,
  spec,
}: {
  clock: SharedValue<number>;
  tl: Timeline;
  c: Center;
  spec: { k: number; a0: number; out: number; lag: number; swirl: number; size: number; rot: number; rotV: number; hue: number; star: boolean };
}) {
  const place = (t: number) => {
    "worklet";
    const { cx, cy, R } = c;
    // The first few lift off the rim while the old badge charges.
    if (tl.hasOld && spec.k < 14 && t > tl.LIFT && t < tl.POP) {
      const a = (spec.k / 14) * TAU + t * 0.0016;
      const d = R * (0.7 + 0.25 * Math.sin(t * 0.01 + spec.k));
      return {
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        rot: t * 0.01 + spec.k,
        hue: spec.k / 14,
        alpha: ((t - tl.LIFT) / tl.CHARGE) * 0.9,
        scale: 1.8 / spec.size,
      };
    }
    const burstAt = tl.hasOld ? tl.POP : 0;
    if (t < burstAt || t >= tl.FORM + 120) return null;
    const outK = tl.hasOld ? outCubic(clamp01((t - burstAt) / tl.OUT)) : 1;
    const inK = inOutCubic(clamp01((t - tl.SWIRL_AT - spec.lag * tl.SWIRL * 0.5) / (tl.SWIRL * (1 - spec.lag * 0.5))));
    const d = R * spec.out * outK * (1 - inK);
    const a = spec.a0 + spec.swirl * inK * 2.4 + (tl.hasOld ? 0 : t * 0.0004);
    // A first badge: the glitter fades in where it hangs instead of bursting.
    const appear = tl.hasOld ? 1 : clamp01(t / 260);
    const near = d < R * 0.18 ? d / (R * 0.18) : 1;
    const late = t > tl.FORM ? 1 - (t - tl.FORM) / 120 : 1;
    return {
      x: cx + Math.cos(a) * d,
      y: cy + Math.sin(a) * d,
      rot: spec.rot + (t / 1000) * spec.rotV,
      hue: spec.hue,
      alpha: appear * near * late,
      scale: 1,
    };
  };
  return <Flake clock={clock} size={spec.size} star={spec.star} place={place} />;
}

function PopFlake({
  clock,
  spec,
  W,
  H,
}: {
  clock: SharedValue<number>;
  spec: { bx: number; by: number; at: number; vx: number; vy: number; life: number; size: number; rot: number; rotV: number; hue: number };
  W: number;
  H: number;
}) {
  const place = (t: number) => {
    "worklet";
    const age = t - spec.at;
    if (age <= 0 || age > spec.life) return null;
    const u = age / spec.life;
    const sec = age / 1000;
    return {
      x: spec.bx * W + spec.vx * sec * (1 - u * 0.4),
      y: spec.by * H + spec.vy * sec * (1 - u * 0.4) + 140 * sec * sec,
      rot: spec.rot + sec * spec.rotV,
      hue: spec.hue,
      alpha: (1 - u) * (1 - u),
      scale: 1,
    };
  };
  return <Flake clock={clock} size={spec.size} star={false} place={place} />;
}

function FallFlake({
  clock,
  tl,
  spec,
  W,
  H,
}: {
  clock: SharedValue<number>;
  tl: Timeline;
  spec: { x: number; y: number; at: number; vy: number; sway: number; size: number; rot: number; rotV: number; hue: number };
  W: number;
  H: number;
}) {
  const place = (t: number) => {
    "worklet";
    const age = t - spec.at;
    if (age <= 0) return null;
    const sec = age / 1000;
    return {
      x: (spec.x + Math.sin(spec.sway + sec * 1.7) * 0.012) * W,
      y: (spec.y + spec.vy * sec) * H,
      rot: spec.rot + sec * spec.rotV,
      hue: spec.hue,
      alpha: Math.min(1, sec * 2) * clamp01((tl.TAIL - t) / 800) * 0.8,
      scale: 1,
    };
  };
  return <Flake clock={clock} size={spec.size} star={false} place={place} />;
}

/** A trail drawn in from off screen as the glitter swirls home. */
function Mote({
  clock,
  tl,
  c,
  spec,
  far,
}: {
  clock: SharedValue<number>;
  tl: Timeline;
  c: Center;
  spec: { a0: number; spread: number; lag: number; swirl: number; r: number; color: string };
  far: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    if (t < tl.SWIRL_AT || t >= tl.FORM) return { opacity: 0 };
    const lp = clamp01((t - tl.SWIRL_AT - spec.lag * tl.SWIRL * 0.6) / (tl.SWIRL * (1 - spec.lag * 0.6)));
    if (lp <= 0) return { opacity: 0 };
    const e = outCubic(lp);
    const ea = outCubic(clamp01(lp + 0.04));
    const d = far * spec.spread * (1 - e);
    const da = far * spec.spread * (1 - ea);
    const a = spec.a0 + spec.swirl * e * 1.3;
    const aa = spec.a0 + spec.swirl * ea * 1.3;
    const x1 = c.cx + Math.cos(a) * d;
    const y1 = c.cy + Math.sin(a) * d;
    const x2 = c.cx + Math.cos(aa) * da;
    const y2 = c.cy + Math.sin(aa) * da;
    const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
    const fade = lp > 0.9 ? (1 - lp) / 0.1 : Math.min(1, lp * 4);
    return {
      opacity: 0.55 * fade,
      transform: [
        { translateX: (x1 + x2) / 2 },
        { translateY: (y1 + y2) / 2 },
        { rotateZ: `${Math.atan2(y2 - y1, x2 - x1)}rad` },
        { scaleX: len / 10 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", left: -5, top: -spec.r / 2, width: 10, height: spec.r, borderRadius: spec.r / 2, backgroundColor: spec.color },
        style,
      ]}
    />
  );
}

/**
 * One tile of the outgoing badge. The wrapper is a window onto the artwork;
 * the art inside is full size and offset, so the tiles together reproduce
 * the badge exactly before they fly apart.
 */
function Shard({
  clock,
  tl,
  c,
  spec,
  art,
  restTilt,
}: {
  clock: SharedValue<number>;
  tl: Timeline;
  c: Center;
  spec: { col: number; row: number; grid: number; dx: number; dy: number; spin: number; lag: number; grav: number };
  art: StickerArt;
  restTilt: number;
}) {
  const r = c.R * 0.62;
  const tile = (r * 2) / spec.grid;
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const span = tl.OUT * 1.4;
    if (t < tl.POP || t >= tl.POP + span) return { opacity: 0 };
    const lp = clamp01(((t - tl.POP) / span - spec.lag) / (1 - spec.lag));
    if (lp <= 0) return { opacity: 0 };
    const e = outCubic(lp);
    return {
      opacity: (1 - e * e) * 0.95,
      transform: [
        { translateX: c.cx - r + spec.col * tile + spec.dx * r * e },
        { translateY: c.cy - r + spec.row * tile + spec.dy * r * e + spec.grav * r * e * e },
        { rotateZ: `${restTilt + spec.spin * e}deg` },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.shard, { width: tile, height: tile }, style]}>
      <View style={{ width: r * 2, height: r * 2, marginLeft: -spec.col * tile, marginTop: -spec.row * tile }}>
        {art.renderArt()}
      </View>
    </Animated.View>
  );
}

/** A holo ring off the new badge; one per `shockwaves`. */
function Ring({ clock, tl, c, index }: { clock: SharedValue<number>; tl: Timeline; c: Center; index: number }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const wp = clamp01(((t - tl.FORM) / 900 - index * 0.16) / (1 - index * 0.16));
    if (t < tl.FORM || wp <= 0 || wp >= 1) return { opacity: 0 };
    const scale = 0.9 + outCubic(wp) * 3.6;
    return {
      opacity: (1 - wp) * 0.5,
      borderColor: holo(0.1 + index * 0.2 + wp * 0.4, 0.35, 1),
      borderWidth: Math.max(0.6, 3 * (1 - wp)) / scale,
      transform: [{ scale }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { left: c.cx - c.R, top: c.cy - c.R, width: c.R * 2, height: c.R * 2, borderRadius: c.R }, style]}
    />
  );
}

const styles = StyleSheet.create({
  badge: { position: "absolute", left: 0, top: 0 },
  glow: { ...StyleSheet.absoluteFillObject, transform: [{ scale: 1.12 }] },
  bloom: { position: "absolute", backgroundColor: "rgba(255,255,255,0.05)" },
  bloomRing: { ...StyleSheet.absoluteFillObject },
  flake: { position: "absolute", left: 0, top: 0, width: 0, height: 0 },
  bar: { position: "absolute", borderRadius: 1, backgroundColor: "#ffffff" },
  shard: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  ring: { position: "absolute" },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },
});
