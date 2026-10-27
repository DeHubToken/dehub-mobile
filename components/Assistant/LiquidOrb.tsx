/**
 * Liquid Orb
 * ==========
 * The Assistant's voice button, as on web: a ball of liquid metal that
 * wobbles on its own and moves with the conversation. It swells with the mic
 * while you talk and moves the most while the reply is playing.
 *
 * Drawn with react-native-svg and driven by one Reanimated frame callback, so
 * nothing re-renders while it animates. The callback stops when `active` is
 * false (screen out of focus) and under Reduce Motion.
 *
 * Two layers share one outline. The metal sits in a view that sways, its path
 * counter-rotated so the outline stays put while the reflection's horizon
 * tilts. The shading and highlight sit above it, unrotated.
 */

import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import type { Rgb } from '../../theme/themeColor';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type LiquidOrbMode = 'idle' | 'listening' | 'thinking' | 'speaking';

interface LiquidOrbProps {
  size: number;
  mode: LiquidOrbMode;
  /** Loudness 0–1, written by whoever owns the mic or the reply. */
  level?: SharedValue<number>;
  /** False pauses the animation, e.g. while the screen is out of focus. */
  active?: boolean;
  onPress?: () => void;
  label: string;
  disabled?: boolean;
}

const MODE_INDEX: Record<LiquidOrbMode, number> = { idle: 0, thinking: 1, listening: 2, speaking: 3 };
// Energy per mode before the live level is added on top, and how much the level counts.
const MODE_BASE = [0.22, 0.3, 0.32, 0.5];
const MODE_GAIN = [0, 0, 1, 1.7];
// Eight points round the rim, each on its own slow sine, so the outline never
// repeats in an obvious way.
const RATES = [1.0, 1.37, 0.83, 1.21, 0.71, 1.53, 0.93, 1.13];
const OFFSETS = [0, 1.9, 3.7, 5.1, 2.6, 4.4, 0.8, 3.1];

// System and the monochrome themes are polished chrome; the colour themes are
// the same metal dipped in their colour.
const CHROME_THEMES = new Set(['system', 'immersive', 'cosmic', 'minimal']);
const CHROME_STOPS: [number, string][] = [
  [0, '#ffffff'], [0.18, '#e4e6ea'], [0.34, '#a9adb4'], [0.45, '#4b4e55'], [0.5, '#0b0c0e'],
  [0.58, '#1d1f23'], [0.72, '#5f636b'], [0.88, '#c3c6cc'], [1, '#f4f5f7'],
];
const SECOND_TINT: Partial<Record<string, Rgb>> = { osaka: [54, 214, 255], island: [34, 211, 238] };

const hex = (c: Rgb) => `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, p: number): Rgb => a.map((v, i) => v * (1 - p) + b[i] * p) as Rgb;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function palette(theme: string, isLight: boolean, accent: Rgb) {
  if (CHROME_THEMES.has(theme) || isLight) {
    return { stops: CHROME_STOPS, glow: isLight ? '#000000' : '#ffffff', glowOpacity: isLight ? 0.25 : 0.5 };
  }
  const b = SECOND_TINT[theme] ?? mix(accent, WHITE, 0.5);
  const stops: [number, string][] = [
    [0, '#ffffff'], [0.16, hex(mix(accent, WHITE, 0.7))], [0.34, hex(accent)], [0.45, hex(mix(accent, BLACK, 0.6))],
    [0.5, hex(mix(accent, BLACK, 0.88))], [0.6, hex(mix(accent, BLACK, 0.65))], [0.76, hex(accent)],
    [1, hex(mix(b, WHITE, 0.3))],
  ];
  return { stops, glow: hex(accent), glowOpacity: 0.7 };
}

/** A smooth closed outline through eight wobbling rim points, in a 100-unit box. */
function blobPath(phase: number, energy: number, swell: number, squash: number, turn: number): string {
  'worklet';
  const n = RATES.length;
  const amp = (4 + energy * 11) / 100;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    // Eased toward a ceiling rather than clipped, so a loud swell stays round
    // and inside the box instead of flattening against it.
    const raw = 38 * swell * (1 + amp * Math.sin(phase * RATES[i] + OFFSETS[i]));
    const r = 46 * Math.tanh(raw / 46);
    const a = (i / n) * Math.PI * 2;
    // The squash is in screen space; `turn` then takes the point into the
    // swaying layer's frame so both layers trace the same outline.
    const x = Math.cos(a) * r * (1 + squash);
    const y = Math.sin(a) * r * (1 - squash);
    xs.push(50 + x * Math.cos(turn) - y * Math.sin(turn));
    ys.push(50 + x * Math.sin(turn) + y * Math.cos(turn));
  }
  // Catmull-Rom through the points, as cubic Béziers.
  let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = (i - 1 + n) % n;
    const p2 = (i + 1) % n;
    const p3 = (i + 2) % n;
    const c1x = xs[i] + (xs[p2] - xs[p0]) / 6;
    const c1y = ys[i] + (ys[p2] - ys[p0]) / 6;
    const c2x = xs[p2] - (xs[p3] - xs[i]) / 6;
    const c2y = ys[p2] - (ys[p3] - ys[i]) / 6;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${xs[p2].toFixed(2)} ${ys[p2].toFixed(2)}`;
  }
  return `${d}Z`;
}

function LiquidOrb({ size, mode, level, active = true, onPress, label, disabled }: LiquidOrbProps) {
  const { theme, isLight, accent } = useAppTheme();
  const colors = useMemo(() => palette(theme, isLight, accent), [theme, isLight, accent]);
  const reduceMotion = !!useReducedMotion();

  const modeIndex = useSharedValue(MODE_INDEX[mode]);
  useEffect(() => { modeIndex.value = MODE_INDEX[mode]; }, [mode, modeIndex]);

  const smooth = useSharedValue(0);
  const energy = useSharedValue(MODE_BASE[MODE_INDEX[mode]]);
  const phase = useSharedValue(0);
  const spin = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const m = modeIndex.value;
    const raw = m >= 2 && level ? Math.max(0, Math.min(1, level.value)) : 0;
    // Fast attack, slow release, like a VU meter.
    smooth.value += (raw - smooth.value) * (raw > smooth.value ? 0.4 : 0.08);
    const target = MODE_BASE[m] + smooth.value * MODE_GAIN[m];
    energy.value += (target - energy.value) * 0.08;
    phase.value += dt * (0.55 + energy.value * 2.4);
    spin.value += dt * (0.17 + energy.value * 1.2);
  }, false);

  useEffect(() => {
    frame.setActive(active && !reduceMotion);
    return () => frame.setActive(false);
  }, [active, reduceMotion, frame]);

  // Shape, swell and sway, worked out once per frame for both layers.
  const shape = useDerivedValue(() => {
    const e = energy.value;
    const p = phase.value;
    const speaking = modeIndex.value === 3;
    const swell = 1 + smooth.value * 0.09 * (speaking ? 1.6 : 1) + 0.02 * Math.sin(p * 0.9);
    const squash = speaking ? 0.05 * e * Math.sin(p * 3.1) : 0.015 * Math.sin(p * 1.7);
    const sway = (12 * Math.sin(p * 0.6) + 14 * e * Math.sin(p * 2.1)) * (Math.PI / 180);
    return { swell, squash, sway };
  });

  const metalPath = useAnimatedProps(() => {
    const { swell, squash, sway } = shape.value;
    return { d: blobPath(phase.value, energy.value, swell, squash, -sway) };
  });
  const outerPath = useAnimatedProps(() => {
    const { swell, squash } = shape.value;
    return { d: blobPath(phase.value, energy.value, swell, squash, 0) };
  });
  const metalStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${shape.value.sway}rad` }],
  }));
  const glint = useAnimatedProps(() => ({
    cx: 50 + 20 * Math.cos(spin.value * Math.PI * 2),
    cy: 52 + 16 * Math.sin(spin.value * Math.PI * 2),
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, 0.3 + energy.value * 0.45),
    transform: [{ scale: 1 + smooth.value * 0.35 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: mode !== 'idle' }}
      hitSlop={8}
      style={{ width: size, height: size, opacity: disabled ? 0.6 : 1 }}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.glow} stopOpacity={colors.glowOpacity} />
              <Stop offset="0.68" stopColor={colors.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="52" r="50" fill="url(#orbGlow)" />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, metalStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            {/* The reflection: chrome mirrors a horizon, bright sky over a dark band. */}
            <LinearGradient id="orbMetal" x1="0.43" y1="0" x2="0.57" y2="1">
              {colors.stops.map(([offset, color]) => <Stop key={offset} offset={offset} stopColor={color} />)}
            </LinearGradient>
          </Defs>
          <AnimatedPath animatedProps={metalPath} fill="url(#orbMetal)" />
        </Svg>
      </Animated.View>

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            {/* Rounds the bands into a sphere: bright upper left, deep lower right. */}
            <RadialGradient id="orbShade" cx="0.36" cy="0.3" r="0.75" fx="0.36" fy="0.3">
              <Stop offset="0.22" stopColor="#000000" stopOpacity={0} />
              <Stop offset="0.55" stopColor="#000000" stopOpacity={0.18} />
              <Stop offset="0.92" stopColor="#000000" stopOpacity={0.62} />
            </RadialGradient>
            <RadialGradient id="orbSpec" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
              <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="orbGlint" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AnimatedPath animatedProps={outerPath} fill="url(#orbShade)" />
          <AnimatedEllipse animatedProps={glint} rx="10" ry="7" fill="url(#orbGlint)" />
          <Ellipse cx="39.5" cy="28" rx="16.5" ry="10" fill="url(#orbSpec)" transform="rotate(-24 39.5 28)" />
        </Svg>
      </View>
    </Pressable>
  );
}

export default memo(LiquidOrb);
