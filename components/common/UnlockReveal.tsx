/**
 * Plays once over media that was just paid for, then calls onDone.
 *
 * It starts as the lock the viewer just paid to open (the caller passes that
 * cover in) and moves it out of the way. Unlocks take turns between three
 * reveals (libs/unlockReveal): Coin drop, Confetti, Foil peel, the same as
 * the website. Only transform and opacity animate; the cover is the already
 * blurred preview. Reduced motion gets a plain fade.
 */
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import type { UnlockRevealKind } from "../../libs/unlockReveal";

const LENGTH = { coin: 1800, confetti: 1900, foil: 1900, fade: 350 } as const;
const GOLD = "#ffd36b";
const CONFETTI = ["#ffd36b", "#ffffff", "#b48cff", "#ff7ad9", "#7af0ff"];

interface Props {
  kind: UnlockRevealKind;
  width: number;
  height: number;
  /** What the lock looked like: the blurred preview the viewer paid to open. */
  cover: React.ReactNode;
  onDone: () => void;
}

const ease = Easing.bezier(0.6, 0, 0.25, 1);

function Spark({ angle, t }: { angle: number; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = 6 + t.value * 30;
    return {
      opacity: t.value === 0 ? 0 : 1 - t.value,
      transform: [{ translateX: Math.cos(angle) * d }, { translateY: Math.sin(angle) * d }],
    };
  });
  return <Animated.View style={[styles.spark, style]} />;
}

function Bit({ i, t, ox, oy }: { i: number; t: SharedValue<number>; ox: number; oy: number }) {
  const p = useMemo(() => {
    const a = -Math.PI / 2 + (((i * 37) % 100) / 100 - 0.5) * Math.PI * 1.3;
    const sp = 220 + ((i * 53) % 100) * 2.6;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, rot: ((i * 71) % 360) - 180, coin: i % 8 === 0,
      c: CONFETTI[i % CONFETTI.length], w: 4 + (i % 4), h: 7 + (i % 5) };
  }, [i]);
  const style = useAnimatedStyle(() => {
    const T = t.value * 1.8;
    return {
      opacity: t.value === 0 ? 0 : t.value > 0.7 ? (1 - t.value) / 0.3 : 1,
      transform: [
        { translateX: ox + p.vx * T * 0.75 },
        { translateY: oy + p.vy * T + 0.5 * 700 * T * T },
        { rotate: `${p.rot * T * 3}deg` },
        { scaleY: p.coin ? 1 : Math.cos(T * 9) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, top: 0, width: p.coin ? 11 : p.w, height: p.coin ? 11 : p.h,
          borderRadius: p.coin ? 6 : 1, backgroundColor: p.c },
        style,
      ]}
    />
  );
}

export default function UnlockReveal({ kind, width, height, cover, onDone }: Props) {
  const reduced = useReducedMotion();
  const shown = reduced ? "fade" : kind;
  const [lockOpen, setLockOpen] = useState(false);

  const coverOpacity = useSharedValue(1);
  const coverScale = useSharedValue(1);
  const coverX = useSharedValue(0);
  const coverY = useSharedValue(0);
  const coverRot = useSharedValue(0);
  const coinY = useSharedValue(-120);
  const coinOpacity = useSharedValue(0);
  const coinScaleY = useSharedValue(1);
  const coinFlip = useSharedValue(1);
  const lockScale = useSharedValue(1);
  const lockOpacity = useSharedValue(1);
  const ring = useSharedValue(0);
  const burst = useSharedValue(0);
  const sheen = useSharedValue(-1);
  const flash = useSharedValue(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (shown === "fade") {
      coverOpacity.value = withTiming(0, { duration: 300 });
    } else if (shown === "coin") {
      coinOpacity.value = withDelay(120, withTiming(1, { duration: 100 }));
      coinY.value = withDelay(120, withTiming(0, { duration: 500, easing: Easing.bezier(0.55, 0, 0.8, 0.3) }));
      coinFlip.value = withDelay(120, withSequence(
        withTiming(0.15, { duration: 100 }), withTiming(1, { duration: 100 }),
        withTiming(0.15, { duration: 100 }), withTiming(1, { duration: 100 }),
        withTiming(0.15, { duration: 100 }), withTiming(1, { duration: 100 }),
      ));
      coinScaleY.value = withDelay(620, withTiming(0, { duration: 160 }));
      timers.push(setTimeout(() => setLockOpen(true), 760));
      lockScale.value = withDelay(760, withSequence(withTiming(1.2, { duration: 160 }), withTiming(1, { duration: 160 }), withTiming(1.3, { duration: 350 })));
      lockOpacity.value = withDelay(1120, withTiming(0, { duration: 350 }));
      ring.value = withDelay(760, withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }));
      coverScale.value = withDelay(950, withTiming(1.35, { duration: 650, easing: ease }));
      coverOpacity.value = withDelay(950, withTiming(0, { duration: 650, easing: ease }));
    } else if (shown === "confetti") {
      coverOpacity.value = withDelay(100, withTiming(0, { duration: 450 }));
      flash.value = withDelay(60, withSequence(withTiming(0.8, { duration: 120 }), withTiming(0, { duration: 280 })));
      burst.value = withDelay(120, withTiming(1, { duration: 1750, easing: Easing.linear }));
    } else {
      const cfg = { duration: 1000, easing: Easing.bezier(0.5, 0.05, 0.3, 1) };
      coverX.value = withDelay(120, withTiming(-width * 1.15, cfg));
      coverY.value = withDelay(120, withTiming(-height * 0.55, cfg));
      coverRot.value = withDelay(120, withTiming(-22, cfg));
      sheen.value = withDelay(1050, withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }));
    }
    timers.push(setTimeout(onDone, LENGTH[shown]));
    return () => timers.forEach(clearTimeout);
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coverStyle = useAnimatedStyle(() => ({
    opacity: coverOpacity.value,
    transform: [
      { translateX: coverX.value }, { translateY: coverY.value },
      { rotate: `${coverRot.value}deg` }, { scale: coverScale.value },
    ],
  }));
  const coinStyle = useAnimatedStyle(() => ({
    opacity: coinOpacity.value,
    transform: [{ translateY: coinY.value + (1 - coinScaleY.value) * 8 }, { scaleX: coinFlip.value }, { scaleY: coinScaleY.value }],
  }));
  const lockStyle = useAnimatedStyle(() => ({ opacity: lockOpacity.value, transform: [{ scale: lockScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.9 * (1 - ring.value),
    transform: [{ scale: 0.4 + ring.value * 2.2 }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheen.value <= -1 || sheen.value >= 1 ? 0 : 0.85,
    transform: [{ translateX: sheen.value * width * 1.4 }, { rotate: "15deg" }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const cx = width / 2, cy = height / 2;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: shown === "confetti" ? "visible" : "hidden" }]}>
      {shown === "foil" ? (
        <Animated.View style={[styles.sheenWrap, { left: -width * 0.3, width: width * 0.5, height: height * 1.4, top: -height * 0.2 }, sheenStyle]}>
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.55)", "rgba(255,214,245,0.5)", "rgba(200,251,255,0.5)", "transparent"]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, coverStyle]}>
        {cover}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.3)" }]} />
        {shown === "foil" ? (
          <>
            <LinearGradient
              colors={["rgba(255,122,217,0.28)", "rgba(122,240,255,0.28)", "rgba(255,242,122,0.28)", "rgba(180,140,255,0.28)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["transparent", "rgba(246,246,255,0.95)", "rgba(142,138,158,0.9)"]}
              start={{ x: 0.75, y: 0.75 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}
            />
          </>
        ) : null}
      </Animated.View>

      {shown === "coin" ? (
        <View style={[styles.lockBox, { left: cx - 30, top: cy - 30 }]}>
          <Animated.View style={[styles.ring, ringStyle]} />
          {[20, 65, 110, 155, 200, 245, 290, 335].map(a => <Spark key={a} angle={(a * Math.PI) / 180} t={ring} />)}
          <Animated.View style={lockStyle}>
            <Icon name={lockOpen ? "LockOpen" : "Lock"} size={30} color="#fff" />
          </Animated.View>
          <Animated.View style={[styles.coin, coinStyle]}>
            <Text style={styles.coinText}>D</Text>
          </Animated.View>
        </View>
      ) : null}

      {shown === "confetti" ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.35)" }, flashStyle]} />
          {Array.from({ length: 40 }, (_, i) => <Bit key={i} i={i} t={burst} ox={cx} oy={cy} />)}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lockBox: { position: "absolute", width: 60, height: 60, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: GOLD },
  spark: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: "#ffe9a6" },
  coin: {
    position: "absolute", top: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: GOLD,
    borderWidth: 2, borderColor: "#d79a1e", alignItems: "center", justifyContent: "center",
  },
  coinText: { fontSize: 11, fontWeight: "900", color: "#7a4a00" },
  sheenWrap: { position: "absolute" },
});
