import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
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
const GHOST = "M100 14C46 14 22 58 22 110L22 226Q34 212 48 226Q62 240 76 226Q88 212 100 226Q112 240 124 226Q138 212 152 226Q166 240 178 226L178 110C178 58 154 14 100 14Z";

let shownThisOpen = false;

function loop(value: Animated.Value, ms: number) {
  return Animated.loop(Animated.sequence([
    Animated.timing(value, { toValue: 1, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    Animated.timing(value, { toValue: 0, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
  ]));
}

/** Body and DeHub-mark face ride the same float and sway, so the face moves with the ghost. */
function Ghost({ size }: { size: number }) {
  const float = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = loop(float, 2800);
    const b = loop(sway, 1900);
    const c = Animated.loop(Animated.sequence([
      Animated.timing(flicker, { toValue: 0.78, duration: 90, useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(flicker, { toValue: 0.9, duration: 70, useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.delay(1100),
    ]));
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [float, sway, flicker]);
  const h = size * 1.25;
  return (
    <Animated.View
      style={{
        width: size, height: h,
        transform: [
          { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) },
          { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "3deg"] }) },
          { skewX: sway.interpolate({ inputRange: [0, 1], outputRange: ["4deg", "-5deg"] }) },
          { scaleY: sway.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
        ],
      }}
    >
      <Svg width={size} height={h} viewBox="-16 -6 232 262" style={{ overflow: "visible" }}>
        <Defs>
          <RadialGradient id="hgBody" cx="0.5" cy="0.35" r="0.7">
            <Stop offset="0" stopColor="#fff4ee" stopOpacity={0.96} />
            <Stop offset="0.6" stopColor="#f2d9d6" stopOpacity={0.76} />
            <Stop offset="1" stopColor="#ce2030" stopOpacity={0.18} />
          </RadialGradient>
          <RadialGradient id="hgEmber" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#ffd2a8" />
            <Stop offset="0.45" stopColor="#ff7a3c" />
            <Stop offset="1" stopColor="#ce2030" />
          </RadialGradient>
        </Defs>
        {/* Crimson halo: wide soft strokes under the body (no shadow box on Android / web). */}
        <Path d={GHOST} fill="none" stroke="#ce2030" strokeOpacity={0.12} strokeWidth={26} strokeLinejoin="round" />
        <Path d={GHOST} fill="none" stroke="#ff5a3c" strokeOpacity={0.18} strokeWidth={12} strokeLinejoin="round" />
        <Path d={GHOST} fill="url(#hgBody)" />
      </Svg>
      <Animated.View
        style={{
          position: "absolute", left: size * 0.25, top: size * 0.29, width: size * 0.5, height: size * 0.5, opacity: flicker,
          transform: [
            { translateX: sway.interpolate({ inputRange: [0, 1], outputRange: [-2, 3] }) },
            { rotate: sway.interpolate({ inputRange: [0, 1], outputRange: ["-2deg", "3deg"] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox={DEHUB_MARK_VIEWBOX}>
          <Defs>
            <RadialGradient id="hgEmber2" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#ffd2a8" />
              <Stop offset="0.45" stopColor="#ff7a3c" />
              <Stop offset="1" stopColor="#ce2030" />
            </RadialGradient>
          </Defs>
          <G><Path d={DEHUB_MARK_PATH} fill="url(#hgEmber2)" /></G>
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
  const ghost = Math.min(190, width * 0.48);
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
          <Text style={{ marginTop: 6, fontSize: 14, color: "rgba(244,236,232,0.72)" }}>
            {t("halloween.otherThemes", "Find other themes in settings now:")}
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
