import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { useSilenceOnRelease } from "../../hooks/useSilenceOnRelease";
import { useReducedMotion } from "react-native-reanimated";
import { KeepDarkScope } from "../../libs/jsx/tone";

/**
 * The top half of the sign-in screen: three short clips fanned like a hand of
 * cards, hearts floating off the front one, and the headline. Mirrors
 * dehubweb's LoginShortsStack (phone sheet).
 *
 * The clips ship with the app (assets/login-stack, cut from the creator page
 * hero), so the sign-in screen never waits on the network and can never show
 * a feed post.
 *
 * Colours: the cards sit in KeepDarkScope and are written in their final
 * colours; the headline is written dark (white) and System Light flips it to
 * ink like every other screen.
 */
const CLIPS = {
  left: require("../../assets/login-stack/left.mp4"),
  front: require("../../assets/login-stack/front.mp4"),
  right: require("../../assets/login-stack/right.mp4"),
};
const POSTERS = {
  left: require("../../assets/login-stack/left.jpg"),
  front: require("../../assets/login-stack/front.jpg"),
  right: require("../../assets/login-stack/right.jpg"),
};
const DEHUB_MARK = require("../../assets/web-icons/dehub-logo-center.png");

const HEART_PATH =
  "M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 2.9 1.5-1.8 3-2.9 5.1-2.9 3.8 0 6 3.8 4.5 7.2C19.5 16.4 12 21 12 21z";

function Clip({ clip, still }: { clip: "left" | "front" | "right"; still: boolean }) {
  const player = useVideoPlayer(CLIPS[clip], (p) => {
    p.muted = true;
    p.loop = true;
    if (!still) p.play();
  });
  useSilenceOnRelease(player);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={POSTERS[clip]} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: false }}
      />
    </View>
  );
}

/** One looping 0→1 value; `delay` staggers the hearts. */
function useLoop(duration: number, still: boolean, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [value, duration, delay, still]);
  return value;
}

function Heart({ color, size, right, bottom, delay, still }: { color: string; size: number; right: number; bottom: number; delay: number; still: boolean }) {
  const t = useLoop(3000, still, delay);
  if (still) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        right,
        bottom,
        opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -170] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] }) },
        ],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={HEART_PATH} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export default function LoginShortsStack() {
  const { t } = useTranslation();
  const { theme, isLight, colors } = useAppTheme();
  const plain = theme === "system" || theme === "minimal";
  const still = useReducedMotion();

  const isOsaka = theme === "osaka";
  // Headline accent, written dark (System Light inverts the grey to ink).
  const accent = theme === "hazy" ? "#C9A7FF" : plain ? "rgba(255,255,255,0.55)" : colors.accent;
  const heart = isLight ? "#FF4D6D" : plain ? "#FFFFFF" : accent;
  const tipBg = isLight ? "#0B0B0D" : isOsaka ? "#FF6FB5" : "#FFFFFF";
  const tipFg = isLight ? "#FFFFFF" : "#09090B";
  const cardLine = isLight ? "rgba(11,11,13,0.08)" : isOsaka ? "rgba(80,200,255,0.5)" : "rgba(255,255,255,0.14)";
  const frontLine = isLight ? "#FFFFFF" : isOsaka ? "#FF6FB5" : theme === "hazy" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.32)";
  const glow = isOsaka ? "#FF6FB5" : theme === "hazy" ? "#9B6BFF" : "#000000";

  const sway = useLoop(5000, still);
  const bob = useLoop(4400, still);
  const coin = useLoop(1600, still);
  const wave = (v: Animated.Value, a: number, b: number) =>
    v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [a, b, a] });

  return (
    <View style={styles.root}>
      <KeepDarkScope>
      <View style={styles.cards} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View
          style={[
            styles.side,
            { left: 0, borderColor: cardLine },
            { transform: [{ translateX: wave(sway, -8, -4) }, { translateY: wave(sway, 14, 8) }, { rotate: "-12deg" }] },
          ]}
        >
          <Clip clip="left" still={!!still} />
          <View style={styles.dim} />
        </Animated.View>
        <Animated.View
          style={[
            styles.side,
            { right: 0, borderColor: cardLine },
            { transform: [{ translateX: wave(sway, 8, 4) }, { translateY: wave(sway, 14, 8) }, { rotate: "12deg" }] },
          ]}
        >
          <Clip clip="right" still={!!still} />
          <View style={styles.dim} />
        </Animated.View>
        <Animated.View style={[styles.frontWrap, { transform: [{ translateY: wave(bob, 0, -6) }] }]}>
          <View
            style={[
              styles.front,
              {
                borderColor: frontLine,
                shadowColor: glow,
                shadowOpacity: isLight ? 0.28 : 0.6,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 18 },
              },
            ]}
          >
            <Clip clip="front" still={!!still} />
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.72)"]} style={styles.shade} />
            <View style={styles.meta}>
              <View style={styles.handle}>
                <Image source={DEHUB_MARK} style={styles.avatar} />
                <Text style={styles.handleText}>@dehub</Text>
              </View>
              <Animated.View style={[styles.tip, { backgroundColor: tipBg, transform: [{ scale: wave(coin, 1, 1.08) }] }]}>
                <Image source={DEHUB_MARK} style={styles.tipMark} />
                <Text style={[styles.tipText, { color: tipFg }]}>{t("loginStack.tip", "Tip DHB")}</Text>
              </Animated.View>
            </View>
          </View>
          <Heart color={heart} size={24} right={-6} bottom={84} delay={0} still={!!still} />
          <Heart color="#FFFFFF" size={18} right={14} bottom={74} delay={1000} still={!!still} />
          <Heart color={heart} size={20} right={-14} bottom={64} delay={2000} still={!!still} />
        </Animated.View>
      </View>
      </KeepDarkScope>
      <Text style={[styles.headline, { color: "#FFFFFF" }]} accessibilityRole="header">
        {t("loginStack.headlineTop", "You will own everything")}
        {"\n"}
        <Text style={{ color: accent }}>{t("loginStack.headlineAccent", "and be happy.")}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", gap: 14, paddingTop: 4 },
  cards: { width: "100%", maxWidth: 342, height: 300 },
  side: {
    position: "absolute",
    top: 26,
    width: 140,
    height: 248,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  frontWrap: { position: "absolute", left: "50%", top: 0, width: 172, height: 300, marginLeft: -86 },
  front: {
    flex: 1,
    borderRadius: 26,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#111",
    elevation: 14,
  },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  meta: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 8, alignItems: "flex-start" },
  handle: { flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#0B0B0D", borderWidth: 1.5, borderColor: "#FFFFFF" },
  handleText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  tip: { flexDirection: "row", alignItems: "center", gap: 5, height: 26, paddingLeft: 4, paddingRight: 10, borderRadius: 13 },
  tipMark: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#0B0B0D" },
  tipText: { fontSize: 11, fontWeight: "800" },
  headline: { textAlign: "center", fontSize: 27, lineHeight: 29, fontWeight: "900", letterSpacing: -0.5 },
});
