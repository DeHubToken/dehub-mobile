import React, { createContext, memo, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Mask,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { isLowEndDevice } from "../../libs/deviceTier";
import { parsePostBg, postBgById, type PostBg } from "../../libs/postBackgrounds";

/**
 * Profile post backgrounds (libs/postBackgrounds.ts), drawn natively: the same
 * 20 backdrops web draws in CSS. Still ones are one SVG. Moving ones slide or
 * scale one or two layers on the UI thread (transform/opacity only), hold a
 * still frame under Reduce motion and on low-end phones, and stop when the
 * list unmounts the cell.
 */

/** Text colours on each tone of backdrop. */
export const POST_BG_INK = {
  dark: { ink: "#FFFFFF", sub: "rgba(255,255,255,0.72)" },
  light: { ink: "#17161B", sub: "rgba(23,22,27,0.66)" },
} as const;

// ---- which backdrop a profile shows -------------------------------------------------

/** A save shows at once everywhere that profile is open, before any refetch. */
const overrides = new Map<string, string | null>();
const listeners = new Set<() => void>();
let version = 0;
export function setPostBgOverride(address: string, id: string | null) {
  overrides.set(address.toLowerCase(), id);
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => version;

/** The backdrop for one profile: a fresh save wins, else the account's customs. */
export function useResolvedPostBg(address: string | undefined, customs: Record<string, unknown> | null | undefined): PostBg | null {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const key = address?.toLowerCase();
  if (key && overrides.has(key)) return postBgById(overrides.get(key));
  return parsePostBg(customs);
}

export const ProfilePostBgContext = createContext<PostBg | null>(null);
export const useProfilePostBg = () => useContext(ProfilePostBgContext);

// ---- drawing ---------------------------------------------------------------------

const still = isLowEndDevice();

function useLoop(duration: number, mode: "loop" | "alternate", active: boolean) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const run = active && !reduce && !still;
  useEffect(() => {
    if (!run) { cancelAnimation(p); p.value = 0.35; return; }
    p.value = 0;
    p.value = withRepeat(
      withTiming(1, { duration, easing: mode === "loop" ? Easing.linear : Easing.inOut(Easing.sin) }),
      -1,
      mode === "alternate",
    );
    return () => cancelAnimation(p);
  }, [run, duration, mode, p]);
  return p;
}

const fill = StyleSheet.absoluteFillObject;

function Still({ id }: { id: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  switch (id) {
    case "ink":
      return (
        <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={u + "a"} cx="8%" cy="0%" rx="80%" ry="70%"><Stop offset="0" stopColor="#2f4380" /><Stop offset="1" stopColor="#2f4380" stopOpacity="0" /></RadialGradient>
            <RadialGradient id={u + "b"} cx="100%" cy="100%" rx="70%" ry="70%"><Stop offset="0" stopColor="#155566" /><Stop offset="1" stopColor="#155566" stopOpacity="0" /></RadialGradient>
          </Defs>
          <Rect width="100" height="100" fill="#0d1324" /><Rect width="100" height="100" fill={`url(#${u}a)`} /><Rect width="100" height="100" fill={`url(#${u}b)`} />
        </Svg>
      );
    case "news":
      return (
        <Svg style={fill}>
          <Defs>
            <Pattern id={u + "g"} width="9" height="9" patternUnits="userSpaceOnUse">
              <Rect x="1" y="2" width="1" height="1" fill="#000" opacity="0.08" /><Rect x="6" y="5" width="1" height="1" fill="#000" opacity="0.1" /><Rect x="3" y="7" width="1" height="1" fill="#000" opacity="0.06" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="#e7e5e0" /><Rect width="100%" height="100%" fill={`url(#${u}g)`} />
        </Svg>
      );
    case "split":
      return (
        <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Rect width="100" height="100" fill="#4a1a8f" /><Path d="M0 0 H62 L38 100 H0 Z" fill="#b5370b" />
        </Svg>
      );
    case "blue":
      return (
        <Svg style={fill}>
          <Defs>
            <Pattern id={u + "s"} width="12" height="12" patternUnits="userSpaceOnUse"><Path d="M12 0V12H0" stroke="#fff" strokeOpacity="0.05" fill="none" /></Pattern>
            <Pattern id={u + "l"} width="48" height="48" patternUnits="userSpaceOnUse"><Path d="M48 0V48H0" stroke="#fff" strokeOpacity="0.14" fill="none" /></Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="#0a3871" /><Rect width="100%" height="100%" fill={`url(#${u}s)`} /><Rect width="100%" height="100%" fill={`url(#${u}l)`} />
        </Svg>
      );
    case "terra":
      return (
        <Svg style={fill}>
          <Defs>
            <Pattern id={u + "t"} width="60" height="56" patternUnits="userSpaceOnUse">
              <Circle cx="10" cy="12" r="3" fill="#e0795c" /><Circle cx="42" cy="34" r="2.5" fill="#3f7f74" /><Circle cx="28" cy="50" r="4" fill="#d8b04a" /><Circle cx="52" cy="8" r="2" fill="#2c2c34" /><Circle cx="6" cy="40" r="5" fill="#9db6c9" />
            </Pattern>
            <LinearGradient id={u + "band"} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ecebe7" stopOpacity="0" /><Stop offset="0.25" stopColor="#ecebe7" stopOpacity="0.78" /><Stop offset="0.78" stopColor="#ecebe7" stopOpacity="0.78" /><Stop offset="1" stopColor="#ecebe7" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="#ecebe7" /><Rect width="100%" height="100%" fill={`url(#${u}t)`} /><Rect width="100%" height="100%" fill={`url(#${u}band)`} />
        </Svg>
      );
    case "half":
      return (
        <Svg style={fill}>
          <Defs>
            <Pattern id={u + "d"} width="10" height="10" patternUnits="userSpaceOnUse"><Circle cx="5" cy="5" r="1.8" fill="#ff3f84" /></Pattern>
            <LinearGradient id={u + "f"} x1="1" y1="0" x2="0.3" y2="0.9"><Stop offset="0" stopColor="#fff" /><Stop offset="1" stopColor="#fff" stopOpacity="0" /></LinearGradient>
            <Mask id={u + "m"}><Rect width="100%" height="100%" fill={`url(#${u}f)`} /></Mask>
          </Defs>
          <Rect width="100%" height="100%" fill="#0f0f12" /><Rect width="100%" height="100%" fill={`url(#${u}d)`} mask={`url(#${u}m)`} />
        </Svg>
      );
    case "topo":
      return (
        <Svg style={fill}>
          <Rect width="100%" height="100%" fill="#1f2e24" />
          <G stroke="#dcffe1" strokeOpacity="0.1" fill="none">
            {Array.from({ length: 22 }, (_, i) => <Circle key={i} cx="18%" cy="120%" r={(i + 1) * 17} />)}
          </G>
          <G stroke="#dcffe1" strokeOpacity="0.07" fill="none">
            {Array.from({ length: 14 }, (_, i) => <Circle key={i} cx="110%" cy="-10%" r={(i + 1) * 23} />)}
          </G>
        </Svg>
      );
    case "velvet":
      return (
        <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={u + "v"} cx="50%" cy="0%" rx="100%" ry="100%"><Stop offset="0" stopColor="#7c1733" /><Stop offset="0.72" stopColor="#2b0610" /></RadialGradient>
            <LinearGradient id={u + "sh"} x1="0" y1="0" x2="1" y2="0.5"><Stop offset="0.3" stopColor="#fff" stopOpacity="0" /><Stop offset="0.45" stopColor="#fff" stopOpacity="0.07" /><Stop offset="0.6" stopColor="#fff" stopOpacity="0" /></LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill={`url(#${u}v)`} /><Rect width="100" height="100" fill={`url(#${u}sh)`} />
        </Svg>
      );
    case "sorbet":
      return (
        <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs><LinearGradient id={u + "s"} x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor="#ffd8c2" /><Stop offset="0.52" stopColor="#ffc4d9" /><Stop offset="1" stopColor="#d9cbff" /></LinearGradient></Defs>
          <Rect width="100" height="100" fill={`url(#${u}s)`} />
        </Svg>
      );
    case "carbon":
      return (
        <Svg style={fill}>
          <Defs>
            <Pattern id={u + "c"} width="10" height="10" patternUnits="userSpaceOnUse">
              <Rect width="5" height="5" fill="#1d1d1d" /><Rect x="5" y="5" width="5" height="5" fill="#1d1d1d" /><Rect x="5" width="5" height="5" fill="#101010" /><Rect y="5" width="5" height="5" fill="#101010" />
            </Pattern>
            <LinearGradient id={u + "sh"} x1="0" y1="0" x2="0.4" y2="1"><Stop offset="0" stopColor="#fff" stopOpacity="0.1" /><Stop offset="0.4" stopColor="#fff" stopOpacity="0" /></LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="#141414" /><Rect width="100%" height="100%" fill={`url(#${u}c)`} /><Rect width="100%" height="100%" fill={`url(#${u}sh)`} />
        </Svg>
      );
    default:
      return null;
  }
}

function Glow({ color, opacity = 0.55 }: { color: string; opacity?: number }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={fill} viewBox="0 0 100 100">
      <Defs><RadialGradient id={u + "g"} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={color} stopOpacity={opacity} /><Stop offset="1" stopColor={color} stopOpacity="0" /></RadialGradient></Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${u}g)`} />
    </Svg>
  );
}

function Dots({ color, size, dots }: { color: string; size: number; dots: [number, number, number][] }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={fill}>
      <Defs>
        <Pattern id={u + "p"} width={size} height={size} patternUnits="userSpaceOnUse">
          {dots.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill={color} />)}
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${u}p)`} />
    </Svg>
  );
}

const SPIN_COLORS = ["#ff6b6b", "#ffb36b", "#ffd166", "#7ee08a", "#06d6a0", "#4cc9f0", "#5b8cff", "#7b61ff", "#c061ff", "#ff6bb0"];

function Moving({ id, w, h, active }: { id: string; w: number; h: number; active: boolean }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dur = { aurora: 22000, lava: 16000, stars: 60000, rain: 3200, drive: 2400, breathe: 7000, spin: 36000, tide: 14000, ember: 18000, holo: 14000 }[id] ?? 10000;
  const mode = id === "aurora" || id === "lava" || id === "holo" ? "alternate" : id === "breathe" ? "alternate" : "loop";
  const p = useLoop(dur, mode, active);
  const q = useLoop(id === "lava" ? 19000 : id === "stars" ? 38000 : 9000, mode, active && (id === "lava" || id === "stars" || id === "tide"));

  const a = useAnimatedStyle(() => {
    const v = p.value;
    switch (id) {
      case "aurora": return { transform: [{ translateX: (-0.06 + 0.12 * v) * w }, { translateY: (-0.04 + 0.09 * v) * h }, { rotate: `${12 * v}deg` }] };
      case "lava": return { transform: [{ translateX: 0.55 * v * w * 0.7 }, { translateY: 0.45 * v * w * 0.7 }, { scale: 1 + 0.15 * v }] };
      case "stars": case "ember": return { transform: [{ translateY: -v * h }] };
      case "rain": return { transform: [{ translateY: v * h }] };
      case "drive": return { transform: [{ perspective: 220 }, { rotateX: "64deg" }, { translateY: v * 40 }] };
      case "breathe": return { opacity: 0.55 + 0.45 * v, transform: [{ scale: 0.8 + 0.32 * v }] };
      case "spin": return { transform: [{ rotate: `${360 * v}deg` }] };
      case "tide": return { transform: [{ translateX: -v * w }] };
      case "holo": return { transform: [{ translateX: -v * w * 2 }] };
      default: return {};
    }
  });
  const b = useAnimatedStyle(() => {
    const v = q.value;
    switch (id) {
      case "lava": return { transform: [{ translateX: -0.6 * v * w * 0.6 }, { translateY: -0.5 * v * w * 0.6 }, { scale: 1 - 0.1 * v }] };
      case "stars": return { transform: [{ translateY: -v * h }] };
      case "tide": return { transform: [{ translateX: -w + v * w }] };
      default: return {};
    }
  });

  switch (id) {
    case "aurora":
      return (
        <>
          <View style={[fill, { backgroundColor: "#06111e" }]} />
          <Animated.View style={[{ position: "absolute", left: -0.4 * w, top: -0.4 * h, width: 1.8 * w, height: 1.8 * h }, a]}>
            <View style={{ position: "absolute", left: "8%", top: "18%", width: "50%", height: "48%" }}><Glow color="#28e6aa" /></View>
            <View style={{ position: "absolute", left: "45%", top: "34%", width: "48%", height: "44%" }}><Glow color="#6e5aff" /></View>
            <View style={{ position: "absolute", left: "30%", top: "55%", width: "42%", height: "38%" }}><Glow color="#14a0ff" opacity={0.45} /></View>
          </Animated.View>
          <View style={[fill, { backgroundColor: "rgba(6,17,30,0.3)" }]} />
        </>
      );
    case "lava": {
      const s = 0.7 * w;
      return (
        <>
          <View style={[fill, { backgroundColor: "#24072a" }]} />
          <Animated.View style={[{ position: "absolute", left: -0.1 * w, top: -0.2 * h, width: s, height: s }, a]}><Glow color="#ff5f6d" opacity={0.95} /></Animated.View>
          <Animated.View style={[{ position: "absolute", right: -0.12 * w, bottom: -0.25 * h, width: 0.6 * w, height: 0.6 * w }, b]}><Glow color="#ffb347" opacity={0.95} /></Animated.View>
        </>
      );
    }
    case "stars":
      return (
        <>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs><RadialGradient id={u + "n"} cx="50%" cy="120%" rx="120%" ry="90%"><Stop offset="0" stopColor="#1a2350" /><Stop offset="0.7" stopColor="#03050d" /></RadialGradient></Defs>
            <Rect width="100" height="100" fill={`url(#${u}n)`} />
          </Svg>
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: w, height: 2 * h }, a]}>
            <Dots color="#ffffff" size={200} dots={[[12, 18, 1.2], [70, 90, 1], [130, 40, 1.5], [180, 140, 1], [40, 160, 1]]} />
          </Animated.View>
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: w, height: 2 * h, opacity: 0.5 }, b]}>
            <Dots color="#cfd8ff" size={120} dots={[[20, 30, 1], [90, 80, 1.2], [55, 110, 0.8]]} />
          </Animated.View>
        </>
      );
    case "rain":
      return (
        <>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id={u + "r"} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#1f2d3d" /><Stop offset="1" stopColor="#0e1620" /></LinearGradient>
              <RadialGradient id={u + "w"} cx="75%" cy="20%" rx="60%" ry="50%"><Stop offset="0" stopColor="#ffc878" stopOpacity="0.22" /><Stop offset="1" stopColor="#ffc878" stopOpacity="0" /></RadialGradient>
            </Defs>
            <Rect width="100" height="100" fill={`url(#${u}r)`} /><Rect width="100" height="100" fill={`url(#${u}w)`} />
          </Svg>
          <Animated.View style={[{ position: "absolute", left: 0, top: -h, width: w, height: 2 * h }, a]}>
            <Svg style={fill}>
              <Defs><Pattern id={u + "s"} width="47" height="60" patternUnits="userSpaceOnUse"><Line x1="22" y1="0" x2="12" y2="60" stroke="#bedcff" strokeOpacity="0.18" strokeWidth="1" /></Pattern></Defs>
              <Rect width="100%" height="100%" fill={`url(#${u}s)`} />
            </Svg>
          </Animated.View>
        </>
      );
    case "drive":
      return (
        <>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs><LinearGradient id={u + "d"} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#120a2b" /><Stop offset="0.58" stopColor="#3a0e4f" /><Stop offset="0.59" stopColor="#ff4d8d" /><Stop offset="0.61" stopColor="#2a0b3c" /><Stop offset="1" stopColor="#2a0b3c" /></LinearGradient></Defs>
            <Rect width="100" height="100" fill={`url(#${u}d)`} />
          </Svg>
          <View style={{ position: "absolute", width: 110, height: 110, left: w / 2 - 55, top: 0.18 * h, borderRadius: 55, backgroundColor: "#ff8f7a", opacity: 0.3 }} />
          <View style={{ position: "absolute", left: 0, right: 0, top: 0.6 * h, bottom: 0, overflow: "hidden" }}>
            <Animated.View style={[{ position: "absolute", left: -w, width: 3 * w, top: -40, height: 1.2 * h }, a]}>
              <Svg style={fill}>
                <Defs><Pattern id={u + "g"} width="40" height="40" patternUnits="userSpaceOnUse"><Path d="M0 0H40M0 0V40" stroke="#ff5ac8" strokeOpacity="0.6" strokeWidth="2" /></Pattern></Defs>
                <Rect width="100%" height="100%" fill={`url(#${u}g)`} />
              </Svg>
            </Animated.View>
          </View>
        </>
      );
    case "breathe":
      return (
        <>
          <View style={[fill, { backgroundColor: "#0b1a1d" }]} />
          <Animated.View style={[{ position: "absolute", left: -0.2 * w, top: -0.1 * h, width: 1.4 * w, height: 1.3 * h }, a]}><Glow color="#28dcc8" /></Animated.View>
        </>
      );
    case "spin": {
      const d = Math.ceil(Math.hypot(w, h)) + 4;
      const r = d / 2;
      return (
        <>
          <View style={[fill, { backgroundColor: "#0d0d12" }]} />
          <Animated.View style={[{ position: "absolute", width: d, height: d, left: w / 2 - r, top: h / 2 - r }, a]}>
            <Svg style={fill} viewBox="-1 -1 2 2">
              {SPIN_COLORS.map((c, i) => {
                const a0 = (i / SPIN_COLORS.length) * Math.PI * 2;
                const a1 = ((i + 1) / SPIN_COLORS.length) * Math.PI * 2 + 0.02;
                return <Path key={c} d={`M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 0 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`} fill={c} />;
              })}
            </Svg>
          </Animated.View>
          <View style={[fill, { backgroundColor: "rgba(10,10,16,0.55)" }]} />
        </>
      );
    }
    case "tide": {
      const wave = (o: number) => (
        <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 800 60">
          <Path d="M0 30 Q50 0 100 30 T200 30 T300 30 T400 30 T500 30 T600 30 T700 30 T800 30 V60 H0Z" fill="#50d1ff" fillOpacity={o} />
        </Svg>
      );
      return (
        <>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs><LinearGradient id={u + "t"} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#0a3a50" /><Stop offset="1" stopColor="#05202e" /></LinearGradient></Defs>
            <Rect width="100" height="100" fill={`url(#${u}t)`} />
          </Svg>
          <Animated.View style={[{ position: "absolute", left: 0, bottom: 0, width: 2 * w, height: 0.46 * h }, a]}>{wave(0.22)}</Animated.View>
          <Animated.View style={[{ position: "absolute", left: 0, bottom: 0, width: 2 * w, height: 0.34 * h }, b]}>{wave(0.2)}</Animated.View>
        </>
      );
    }
    case "ember":
      return (
        <>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs><RadialGradient id={u + "e"} cx="50%" cy="120%" rx="120%" ry="80%"><Stop offset="0" stopColor="#5a1a06" /><Stop offset="0.7" stopColor="#140804" /></RadialGradient></Defs>
            <Rect width="100" height="100" fill={`url(#${u}e)`} />
          </Svg>
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: w, height: 2 * h }, a]}>
            <Dots color="#ffb35c" size={180} dots={[[20, 30, 2], [90, 110, 1.5], [150, 60, 2.5], [60, 170, 1.5]]} />
          </Animated.View>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs><LinearGradient id={u + "f"} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#140804" stopOpacity="0.95" /><Stop offset="0.6" stopColor="#140804" stopOpacity="0" /></LinearGradient></Defs>
            <Rect width="100" height="100" fill={`url(#${u}f)`} />
          </Svg>
        </>
      );
    case "holo":
      return (
        <>
          <View style={[fill, { backgroundColor: "#ece8ff" }]} />
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3 * w }, a]}>
            <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
              <Defs>
                <LinearGradient id={u + "h"} x1="0" y1="0" x2="1" y2="0.2">
                  {["#ffd6e8", "#d6f0ff", "#e6ffd6", "#fff2c7", "#e9d6ff", "#ffd6e8", "#d6f0ff", "#e6ffd6", "#fff2c7", "#e9d6ff", "#ffd6e8"].map((c, i) => <Stop key={i} offset={i / 10} stopColor={c} />)}
                </LinearGradient>
              </Defs>
              <Rect width="100" height="100" fill={`url(#${u}h)`} />
            </Svg>
          </Animated.View>
          <Svg style={fill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs><LinearGradient id={u + "s"} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#fff" stopOpacity="0.55" /><Stop offset="0.4" stopColor="#fff" stopOpacity="0" /><Stop offset="0.7" stopColor="#fff" stopOpacity="0.35" /><Stop offset="1" stopColor="#fff" stopOpacity="0" /></LinearGradient></Defs>
            <Rect width="100" height="100" fill={`url(#${u}s)`} />
          </Svg>
        </>
      );
    default:
      return null;
  }
}

/**
 * The backdrop itself: fills its parent, sits behind the content, never takes
 * touches. `active={false}` holds a moving one still (e.g. a hidden tab).
 */
export const PostBgLayer = memo(function PostBgLayer({ bg, active = true }: { bg: PostBg | null; active?: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 1 || Math.abs(size.h - height) > 1) setSize({ w: width, h: height });
  };
  if (!bg) return null;
  return (
    <View pointerEvents="none" style={[fill, { overflow: "hidden" }]} onLayout={bg.kind === "moving" ? onLayout : undefined}>
      {bg.kind === "still" ? <Still id={bg.id} /> : size ? <Moving id={bg.id} w={size.w} h={size.h} active={active} /> : null}
    </View>
  );
});

/** Ink and sub colours for text on a backdrop. */
export function usePostBgInk(bg: PostBg | null) {
  return useMemo(() => (bg ? POST_BG_INK[bg.tone] : null), [bg]);
}
