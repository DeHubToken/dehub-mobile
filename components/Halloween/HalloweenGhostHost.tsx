import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { HALLOWEEN_THEME, isHalloweenDay } from "../../libs/halloweenOverride";
import { ThemeSample } from "../Settings/ThemePicker";
import { APP_THEMES, type AppThemeName } from "../../theme/colors";
import { ScreenNames } from "../../navigation/ScreenNames";
import { navigationRef } from "../../App";
import { DEHUB_MARK_PATH, DEHUB_MARK_VIEWBOX } from "./dehubMarkPath";

const SEEN_KEY = "dehub.halloween2026.ghostSeen";
const DWELL_MS = 2_500;
const FEED_SCREENS = new Set<string>([ScreenNames.Home, ScreenNames.Explore]);
const GHOST = "M100 6C150 6 176 42 178 98C180 140 186 178 190 204C192 218 180 226 168 218C158 211 150 213 143 223C135 235 120 235 112 223C106 214 94 214 88 223C80 235 65 235 57 223C50 213 42 211 32 218C20 226 8 218 10 204C14 178 20 140 22 98C24 42 50 6 100 6Z";

let shownThisOpen = false;

function loop(value: Animated.Value, ms: number) {
  return Animated.loop(Animated.sequence([
    Animated.timing(value, { toValue: 1, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    Animated.timing(value, { toValue: 0, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
  ]));
}

/**
 * All vector, so it stays sharp on every screen: a clean silhouette with
 * shading and a highlight clipped inside it, a white rim, a smooth radial
 * aura behind, and the DeHub mark face riding the same float.
 */
function Ghost({ size }: { size: number }) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = loop(float, 3200);
    a.start();
    return () => a.stop();
  }, [float]);
  const h = size * (300 / 260);
  return (
    <Animated.View
      style={{
        width: size, height: h,
        transform: [
          { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ["-2.5deg", "2.5deg"] }) },
        ],
      }}
    >
      <Svg width={size} height={h} viewBox="-30 -20 260 300">
        <Defs>
          <RadialGradient id="hgAura" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor="#ff3b4a" stopOpacity={0.55} />
            <Stop offset="0.55" stopColor="#ce2030" stopOpacity={0.18} />
            <Stop offset="1" stopColor="#ce2030" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="hgBody" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="0.45" stopColor="#f6eeee" />
            <Stop offset="0.74" stopColor="#efdfe1" stopOpacity={0.94} />
            <Stop offset="1" stopColor="#f2c9cf" stopOpacity={0.72} />
          </LinearGradient>
          <LinearGradient id="hgShade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#5a1822" stopOpacity={0.1} />
            <Stop offset="0.35" stopColor="#5a1822" stopOpacity={0} />
            <Stop offset="0.7" stopColor="#5a1822" stopOpacity={0} />
            <Stop offset="1" stopColor="#5a1822" stopOpacity={0.2} />
          </LinearGradient>
          <RadialGradient id="hgSpec" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="hgRim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
            <Stop offset="0.6" stopColor="#ffd9dc" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#ff5a6a" stopOpacity={0} />
          </LinearGradient>
          <ClipPath id="hgClip"><Path d={GHOST} /></ClipPath>
        </Defs>
        <Ellipse cx={100} cy={130} rx={140} ry={150} fill="url(#hgAura)" />
        <Path d={GHOST} fill="url(#hgBody)" />
        <G clipPath="url(#hgClip)">
          <Rect x={0} y={0} width={200} height={240} fill="url(#hgShade)" />
          <Ellipse cx={66} cy={44} rx={40} ry={26} fill="url(#hgSpec)" />
        </G>
        <Path d={GHOST} fill="none" stroke="url(#hgRim)" strokeWidth={1.6} />
      </Svg>
      <Animated.View
        style={{
          position: "absolute", left: size * (78 / 260), top: h * (78 / 300), width: size * (104 / 260), height: size * (104 / 260),
          transform: [
            { translateX: float.interpolate({ inputRange: [0, 1], outputRange: [-1.5, 1.5] }) },
            { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox={DEHUB_MARK_VIEWBOX}>
          <Defs>
            <LinearGradient id="hgMark" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ff8a4c" />
              <Stop offset="0.55" stopColor="#e2283a" />
              <Stop offset="1" stopColor="#9e0f1f" />
            </LinearGradient>
          </Defs>
          <Path d={DEHUB_MARK_PATH} fill="url(#hgMark)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export function GhostPopup({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { themeChoice, setTheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter]);
  const close = () => {
    Animated.timing(enter, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onClose());
  };
  const themes = APP_THEMES.filter((v) => v !== HALLOWEEN_THEME) as AppThemeName[];
  const ghost = Math.min(230, width * 0.58);
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View style={{ flex: 1, opacity: enter }}>
        <Pressable onPress={close} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(4,2,3,0.86)" }} />
        <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={{
              transform: [
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            }}
          >
            <Ghost size={ghost} />
          </Animated.View>
          <Text style={{ marginTop: 6, fontSize: 30, fontWeight: "800", color: "#f4ece8", textShadowColor: "rgba(206,32,48,0.7)", textShadowRadius: 16 }}>
            {t("halloween.title", "Happy Halloween")}
          </Text>
          <TouchableOpacity
            onPress={close}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={{ marginTop: 14, marginBottom: 8, height: 46, paddingHorizontal: 26, borderRadius: 23, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,170,175,0.45)" }}
          >
            <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
              <Defs>
                <LinearGradient id="hgEnter" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#e2334a" />
                  <Stop offset="1" stopColor="#a3121f" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="10" height="10" fill="url(#hgEnter)" />
            </Svg>
            <Text style={{ fontSize: 15, fontWeight: "800", letterSpacing: 0.3, color: "#fff" }}>
              {t("halloween.enter", "Enter the dungeon")}
            </Text>
          </TouchableOpacity>
          <Text style={{ marginTop: 6, fontSize: 14, color: "rgba(244,236,232,0.72)" }}>
            {t("halloween.otherThemes", "Not feeling spooky? Find other themes:")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 12, flexGrow: 0, width }}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 8 }}
          >
            {themes.map((value) => (
              <ThemeSample
                key={value}
                value={value}
                label={t(value === "system-light" ? "settings.systemLight" : `settings.${value}`)}
                active={themeChoice === value}
                ring="#ce2030"
                onPress={() => { setTheme(value); close(); }}
              />
            ))}
          </ScrollView>
        </View>
        <TouchableOpacity
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Close")}
          style={{ position: "absolute", top: 54, right: 16, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,9,10,0.7)", borderWidth: 1, borderColor: "rgba(206,32,48,0.45)" }}
        >
          <X size={20} color="#f4ece8" />
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

/**
 * Halloween 2026: once per device while the Horror override is on, a ghost
 * with the DeHub mark for a face says Happy Halloween and offers every other
 * theme. Mounted in App.tsx; renders nothing otherwise.
 */
export default function HalloweenGhostHost() {
  const { themeChoice } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const eligible = themeChoice === HALLOWEEN_THEME;

  useEffect(() => {
    if (!eligible || shownThisOpen || !isHalloweenDay()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (cancelled || shownThisOpen || !isHalloweenDay()) return;
      const route = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
      if (!route || !FEED_SCREENS.has(route)) { timer = setTimeout(attempt, DWELL_MS); return; }
      const seen = await AsyncStorage.getItem(SEEN_KEY).catch(() => "1");
      if (cancelled || seen === "1") return;
      shownThisOpen = true;
      AsyncStorage.setItem(SEEN_KEY, "1").catch(() => {});
      setVisible(true);
    };
    timer = setTimeout(attempt, DWELL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [eligible]);

  if (!visible) return null;
  return <GhostPopup onClose={() => setVisible(false)} />;
}
