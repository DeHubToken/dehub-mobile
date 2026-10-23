/**
 * RadioFullscreen — the station full screen, with a visualizer and volume
 * ========================================================================
 * The app's counterpart of web's RadioFullscreenVisualizer: now playing,
 * a visualizer you can flip between styles and recolour, play/pause and a
 * volume slider.
 *
 * Web draws from a Web Audio analyser. The app has no analyser for a live
 * stream without new native code (Android's visualizer also needs the
 * microphone permission), so the motion here is generated while the station
 * plays and settles when it pauses. Everything runs on the UI thread through
 * Reanimated, which the installed app already has.
 *
 * @module components/Music/RadioFullscreen
 */

import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import Icon from "../ui/Icon";
import { setRadioVolume, toggleRadioStation, useRadioPlayer } from "../../libs/radio-player";

type VizStyle = "bars" | "mirror" | "pulse" | "orb";

const STYLES: { value: VizStyle; key: string; fallback: string }[] = [
  { value: "bars", key: "copy.f2c3526915d3", fallback: "Bars" },
  { value: "mirror", key: "copy.90fade6fb78e", fallback: "Mirror" },
  { value: "pulse", key: "copy.f7a403c6cdf3", fallback: "Pulse" },
  { value: "orb", key: "copy.8483460e43ab", fallback: "Orb" },
];

const BAR_COUNT = 28;
const CYCLE = Math.PI * 2 * 40;
const CYCLE_MS = 60_000;

const hsl = (h: number, l = 60) => `hsl(${Math.round(h)}, 80%, ${l}%)`;

/** A loudness-like value for bar i at time t: a few sines, louder in the lows. */
function level(t: number, i: number, active: number) {
  "worklet";
  const x = i / BAR_COUNT;
  const v =
    0.5 * Math.abs(Math.sin(t * (1.1 + x * 0.9) + i * 0.7)) +
    0.3 * Math.abs(Math.sin(t * 2.3 + i * 1.3)) +
    0.2 * Math.abs(Math.sin(t * 0.6 + i * 0.25));
  return (0.12 + v * (1 - x * 0.45)) * active + 0.06 * (1 - active);
}

function Bar({ i, clock, active, color, mirror }: { i: number; clock: SharedValue<number>; active: SharedValue<number>; color: string; mirror: boolean }) {
  const style = useAnimatedStyle(() => ({ height: `${Math.round(level(clock.value, i, active.value) * (mirror ? 50 : 100))}%` }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

function Ring({ k, clock, active, color }: { k: number; clock: SharedValue<number>; active: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const phase = ((clock.value * 0.35 + k / 3) % 1 + 1) % 1;
    return {
      transform: [{ scale: 0.4 + phase * (0.6 + 0.6 * active.value) }],
      opacity: (1 - phase) * (0.25 + 0.6 * active.value),
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

function Orb({ clock, active, color }: { clock: SharedValue<number>; active: SharedValue<number>; color: string }) {
  const core = useAnimatedStyle(() => ({ transform: [{ scale: 0.85 + level(clock.value, 3, active.value) * 0.35 }] }));
  const glow = useAnimatedStyle(() => ({
    transform: [{ scale: 1.1 + level(clock.value, 9, active.value) * 0.6 }],
    opacity: 0.15 + 0.3 * active.value,
  }));
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.orbGlow, { backgroundColor: color }, glow]} />
      <Animated.View style={[styles.orb, { backgroundColor: color }, core]} />
    </View>
  );
}

export default function RadioFullscreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { station, isPlaying, volume } = useRadioPlayer();
  const [styleIndex, setStyleIndex] = useState(0);
  const [hue, setHue] = useState(260);
  const [logoFailed, setLogoFailed] = useState(false);

  const clock = useSharedValue(0);
  const active = useSharedValue(0);

  useEffect(() => {
    active.value = withTiming(isPlaying ? 1 : 0, { duration: 500 });
    if (visible && isPlaying) {
      clock.value = withRepeat(withTiming(clock.value + CYCLE, { duration: CYCLE_MS, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(clock);
    }
    return () => cancelAnimation(clock);
  }, [visible, isPlaying, clock, active]);

  useEffect(() => setLogoFailed(false), [station?.favicon]);

  const color = hsl(hue);
  const viz = STYLES[styleIndex].value;
  const bars = useMemo(() => Array.from({ length: BAR_COUNT }, (_, i) => i), []);
  const tags = station?.tags ? station.tags.split(",").filter(Boolean).slice(0, 3).join(" • ") : "";

  if (!station) return null;

  const step = (d: number) => setStyleIndex((i) => (i + d + STYLES.length) % STYLES.length);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <View style={styles.logo}>
            {station.favicon && !logoFailed ? (
              <Image source={{ uri: station.favicon }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setLogoFailed(true)} />
            ) : (
              <Icon name="Radio" size={22} color="#71717A" />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>{t("copy.8b2ae991573c", { defaultValue: "Now Playing" }).toUpperCase()}</Text>
            <Text style={styles.title} numberOfLines={1}>{station.name?.trim() || t("music.radio")}</Text>
            {!!tags && <Text style={styles.tags} numberOfLines={1}>{tags}</Text>}
          </View>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")}>
            <Icon name="Minimize2" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.stage}>
          {(viz === "bars" || viz === "mirror") && (
            <View style={[styles.bars, viz === "mirror" && { alignItems: "center" }]}>
              {bars.map((i) => (
                <Bar key={i} i={i} clock={clock} active={active} color={hsl(hue + i * 2)} mirror={viz === "mirror"} />
              ))}
            </View>
          )}
          {viz === "pulse" && (
            <View style={styles.center}>
              {[0, 1, 2].map((k) => <Ring key={k} k={k} clock={clock} active={active} color={color} />)}
              <View style={[styles.pulseDot, { backgroundColor: color }]} />
            </View>
          )}
          {viz === "orb" && <Orb clock={clock} active={active} color={color} />}
        </View>

        <View style={styles.switcher}>
          <Pressable onPress={() => step(-1)} style={styles.iconBtn} hitSlop={6} accessibilityRole="button">
            <Icon name="ChevronLeft" size={20} color="#FFFFFF" />
          </Pressable>
          <View style={{ minWidth: 120, alignItems: "center" }}>
            <Text style={styles.styleName}>{t(STYLES[styleIndex].key, { defaultValue: STYLES[styleIndex].fallback })}</Text>
            <Text style={styles.tags}>{t("copy.f6ec7f0c995b", { defaultValue: "Visualization" })}</Text>
          </View>
          <Pressable onPress={() => step(1)} style={styles.iconBtn} hitSlop={6} accessibilityRole="button">
            <Icon name="ChevronRight" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.row}>
          <Icon name="Palette" size={16} color="#A1A1AA" />
          <Slider
            style={{ flex: 1 }}
            minimumValue={0}
            maximumValue={360}
            step={1}
            value={hue}
            onValueChange={setHue}
            minimumTrackTintColor={color}
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#FFFFFF"
          />
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={() => toggleRadioStation(station)}
            style={[styles.playBtn, { backgroundColor: color }]}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? t("music.pauseStation") : t("music.resumeStation")}
          >
            <Icon name={isPlaying ? "Pause" : "Play"} size={20} color="#000000" fill="#000000" />
          </Pressable>
          <Pressable onPress={() => setRadioVolume(volume > 0 ? 0 : 0.7)} hitSlop={8} accessibilityRole="button">
            <Icon name={volume > 0 ? "Volume2" : "VolumeX"} size={18} color="#A1A1AA" />
          </Pressable>
          <Slider
            style={{ flex: 1 }}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onValueChange={setRadioVolume}
            minimumTrackTintColor="#FFFFFF"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#FFFFFF"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 52, height: 52, borderRadius: 12, overflow: "hidden", backgroundColor: "#18181B", alignItems: "center", justifyContent: "center" },
  kicker: { color: "#A1A1AA", fontSize: 11, letterSpacing: 1 },
  title: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  tags: { color: "#71717A", fontSize: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  stage: { flex: 1, justifyContent: "center" },
  bars: { height: "60%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 3 },
  bar: { flex: 1, borderRadius: 3, minHeight: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 260, height: 260, borderRadius: 130, borderWidth: 2 },
  pulseDot: { width: 28, height: 28, borderRadius: 14 },
  orb: { width: 150, height: 150, borderRadius: 75 },
  orbGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75 },
  switcher: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  styleName: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  playBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
