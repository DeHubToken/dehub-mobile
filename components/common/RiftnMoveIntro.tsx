import React, { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { bootRevealed } from "../../libs/bootReveal";

/**
 * The jump from DeHub to Riftn, the same starfield the web plays while it
 * moves people from dehub.io to riftn.com: stars speed up into streaks, a
 * white flash, then the Riftn wordmark lands as the stars settle.
 *
 * Shown once per install on the first app open after this update, signed in
 * or not. Plain views moved by Reanimated on the UI thread, no Skia, so it
 * runs on every binary that takes this update.
 */
const SEEN_KEY = "riftn.moveIntro.v1.seen";
const JUMP_MS = 2200;
const HOLD_MS = 1900;
const FADE_MS = 450;
const STAR_COUNT = 90;
const BAR = 100;

let shownThisOpen = false;

type Star = { ang: number; r: number; z: number };

function seg(p: number, x: number, y: number) {
  "worklet";
  return Math.min(1, Math.max(0, (p - x) / (y - x)));
}
function ease(t: number) {
  "worklet";
  return 1 - Math.pow(1 - t, 3);
}
function easeIn(t: number) {
  "worklet";
  return t * t * t;
}
function speedAt(p: number) {
  "worklet";
  const ramp = easeIn(seg(p, 0.05, 0.5));
  const settle = ease(seg(p, 0.55, 0.95));
  return { speed: 0.08 + 2.8 * ramp * (1 - settle) + 0.04 * settle, streak: ramp * (1 - settle) };
}

function StarStreak({ star, travel, p, cx, cy, R }: { star: Star; travel: SharedValue<number>; p: SharedValue<number>; cx: number; cy: number; R: number }) {
  const style = useAnimatedStyle(() => {
    const { streak } = speedAt(p.value);
    const raw = star.z + travel.value * (0.4 + star.r);
    const wraps = Math.floor(raw);
    const z = 0.02 + (raw - wraps) * 0.98;
    const ang = star.ang + wraps * 2.39996;
    const r1 = Math.pow(z, 2.2) * R;
    const r0 = Math.pow(Math.max(0, z - 0.04 - 0.26 * streak), 2.2) * R;
    const thick = 0.6 + 1.8 * z;
    const len = Math.max(thick, r1 - r0);
    return {
      height: thick,
      borderRadius: thick / 2,
      opacity: 0.25 + 0.75 * z,
      transform: [
        { translateX: cx - BAR / 2 },
        { translateY: cy - thick / 2 },
        { rotate: `${ang}rad` },
        { translateX: (r0 + r1) / 2 },
        { scaleX: len / BAR },
      ],
    };
  });
  return <Animated.View style={[styles.star, style]} />;
}

function MoveJump({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const still = !!useReducedMotion();
  const p = useSharedValue(still ? 1 : 0);
  const travel = useSharedValue(0);
  const fade = useSharedValue(1);
  const closing = useRef(false);
  const stars = useMemo<Star[]>(
    () => Array.from({ length: STAR_COUNT }, () => ({ ang: Math.random() * Math.PI * 2, r: Math.random(), z: Math.random() })),
    [],
  );

  useFrameCallback((info) => {
    if (still) return;
    const dt = Math.min(50, info.timeSincePreviousFrame ?? 16) / 1000;
    travel.value += speedAt(p.value).speed * dt;
  });

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    fade.value = withTiming(0, { duration: FADE_MS, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(onDone)();
    });
  };

  useEffect(() => {
    if (!still) p.value = withTiming(1, { duration: JUMP_MS, easing: Easing.linear });
    const timer = setTimeout(close, (still ? 0 : JUMP_MS) + HOLD_MS);
    const back = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => { clearTimeout(timer); back.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: 0.92 * seg(p.value, 0.48, 0.53) * (1 - seg(p.value, 0.53, 0.68)),
  }));
  const logoStyle = useAnimatedStyle(() => {
    const inn = ease(seg(p.value, 0.56, 0.82));
    return { opacity: inn, transform: [{ scale: 1.35 - 0.35 * inn }] };
  });
  const copyStyle = useAnimatedStyle(() => {
    const c = ease(seg(p.value, 0.78, 1));
    return { opacity: c, transform: [{ translateY: 10 * (1 - c) }] };
  });

  const logoW = Math.min(width * 0.62, 320);
  const R = Math.hypot(width, height) / 2;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t("riftnMove.continue", "Tap to continue")}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {stars.map((star, i) => (
            <StarStreak key={i} star={star} travel={travel} p={p} cx={width / 2} cy={height / 2} R={R} />
          ))}
        </View>
        <View style={styles.center} pointerEvents="none">
          <Animated.Image
            source={require("../../assets/brand/riftn-wordmark-move.png")}
            resizeMode="contain"
            style={[{ width: logoW, height: logoW * (180 / 604) }, logoStyle]}
          />
          <Animated.View style={[styles.copy, copyStyle]}>
            <Text style={styles.title}>{t("riftnMove.title", "DeHub is now Riftn")}</Text>
            <Text style={styles.body}>{t("riftnMove.body", "Same app, same account, same friends. Just a new name.")}</Text>
            <Text style={styles.route}>dehub.io → riftn.com</Text>
          </Animated.View>
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
        <Animated.Text style={[styles.hint, copyStyle]}>{t("riftnMove.continue", "Tap to continue")}</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Mounted once in App.tsx, above everything. Waits for the boot preloader to
 * lift, then plays the jump if this install has not seen it yet.
 */
export default function RiftnMoveIntro() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (shownThisOpen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (cancelled || shownThisOpen) return;
      if (!bootRevealed) { timer = setTimeout(attempt, 400); return; }
      const seen = await AsyncStorage.getItem(SEEN_KEY).catch(() => "1");
      if (cancelled || seen === "1") return;
      shownThisOpen = true;
      AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
      setVisible(true);
    };
    timer = setTimeout(attempt, 300);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  if (!visible) return null;
  return <MoveJump onDone={() => setVisible(false)} />;
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#000", zIndex: 10000, elevation: 10000 },
  star: { position: "absolute", left: 0, top: 0, width: BAR, backgroundColor: "#fff" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  copy: { marginTop: 30, alignItems: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center" },
  body: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 300 },
  route: { marginTop: 18, color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 2 },
  flash: { backgroundColor: "#fff" },
  hint: { position: "absolute", bottom: 54, alignSelf: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 },
});
