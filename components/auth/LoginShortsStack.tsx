import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { VideoView, useVideoPlayer } from "expo-video";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { useSilenceOnRelease } from "../../hooks/useSilenceOnRelease";
import { useReducedMotion } from "react-native-reanimated";
import { KeepDarkScope } from "../../libs/jsx/tone";

/**
 * The top half of the sign-in screen: two lanes of short clips drifting past
 * in opposite directions (the feed already running), then the headline. One
 * clip is the AI restyle and says so; the rest are ordinary creator posts.
 * Mirrors dehubweb's LoginShortsStack (phone sheet).
 *
 * The clips ship with the app (assets/login-stack, credits in dehubweb's
 * public/login-stack/CREDITS.txt), so the sign-in screen never waits on the
 * network and can never show a feed post.
 *
 * Colours: the tiles sit in KeepDarkScope and are written in their final
 * colours; the headline is written dark (white) and System Light flips it to
 * ink like every other screen.
 */
const CLIPS = {
  restyle: { video: require("../../assets/login-stack/restyle.mp4"), poster: require("../../assets/login-stack/restyle.jpg") },
  concert: { video: require("../../assets/login-stack/concert.mp4"), poster: require("../../assets/login-stack/concert.jpg") },
  street: { video: require("../../assets/login-stack/street.mp4"), poster: require("../../assets/login-stack/street.jpg") },
  bass: { video: require("../../assets/login-stack/bass.mp4"), poster: require("../../assets/login-stack/bass.jpg") },
  skate: { video: require("../../assets/login-stack/skate.mp4"), poster: require("../../assets/login-stack/skate.jpg") },
  friends: { video: require("../../assets/login-stack/friends.mp4"), poster: require("../../assets/login-stack/friends.jpg") },
  drums: { video: require("../../assets/login-stack/drums.mp4"), poster: require("../../assets/login-stack/drums.jpg") },
  vlog: { video: require("../../assets/login-stack/vlog.mp4"), poster: require("../../assets/login-stack/vlog.jpg") },
};
type ClipName = keyof typeof CLIPS;

const LANE_A: ClipName[] = ["restyle", "concert", "street", "bass"];
const LANE_B: ClipName[] = ["skate", "friends", "drums", "vlog"];
const GAP = 8;
const SIDE = 10;
/** One trip through a lane's four clips, as on web. */
const LOOP_MS = 32000;

function Clip({ name, playing }: { name: ClipName; playing: boolean }) {
  const player = useVideoPlayer(CLIPS[name].video, (p) => {
    p.muted = true;
    p.loop = true;
  });
  useSilenceOnRelease(player);
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={CLIPS[name].poster} style={StyleSheet.absoluteFill} resizeMode="cover" />
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

/**
 * A lane is its four clips plus the first two again, so the jump from the end
 * back to the start lands on the same picture. Only tiles inside the window
 * play, so at most three decode per lane.
 */
function Lane({ clips, down, tileW, height, still, restyleLabel, line }: {
  clips: ClipName[];
  down?: boolean;
  tileW: number;
  height: number;
  still: boolean;
  restyleLabel: string;
  line: string;
}) {
  const tileH = (tileW * 16) / 9;
  const step = tileH + GAP;
  const span = step * clips.length;
  // Lane B starts part-way down a tile, like web's -40% offset.
  const offset = down ? -tileW * 0.4 : 0;
  const tiles = [...clips, ...clips.slice(0, 2)];

  // Which tiles overlap the window when the loop is at `value` (0..1).
  const visibleAt = (value: number) => {
    const y = (down ? span * (1 - value) : span * value) - offset;
    return tiles.map((_, i) => i * step + tileH > y && i * step < y + height);
  };
  const t = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState<boolean[]>(() => visibleAt(0));

  useEffect(() => {
    if (still) return;
    const anim = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    const id = t.addListener(({ value }) => {
      const next = visibleAt(value);
      setVisible((prev) => (prev.every((v, i) => v === next[i]) ? prev : next));
    });
    return () => {
      anim.stop();
      t.removeListener(id);
    };
    // visibleAt only reads the values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, still, down, span, step, tileH, height, offset, clips]);

  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: down ? [offset - span, offset] : [offset, offset - span],
  });

  return (
    <Animated.View style={{ width: tileW, gap: GAP, transform: [{ translateY }] }}>
      {tiles.map((name, i) => (
        <View key={i} style={[styles.tile, { width: tileW, height: tileH, borderColor: line }]}>
          <Clip name={name} playing={!still && visible[i]} />
          {name === "restyle" && (
            <View style={styles.ai}>
              <Ionicons name="sparkles" size={11} color="#FFFFFF" />
              <Text style={styles.aiText}>{restyleLabel}</Text>
            </View>
          )}
        </View>
      ))}
    </Animated.View>
  );
}

export default function LoginShortsStack() {
  const { t } = useTranslation();
  const { theme, isLight, colors } = useAppTheme();
  const plain = theme === "system" || theme === "minimal";
  const still = !!useReducedMotion();
  const { width, height: screenH } = useWindowDimensions();

  // Headline accent, written dark (System Light inverts the grey to ink).
  const accent = theme === "hazy" ? "#C9A7FF" : plain ? "rgba(255,255,255,0.55)" : colors.accent;
  const line = isLight ? "rgba(11,11,13,0.08)" : theme === "osaka" ? "rgba(80,200,255,0.4)" : "rgba(255,255,255,0.10)";

  // The screen pads 24 each side; the lanes sit 10 from the edges.
  const lanesW = width - SIDE * 2;
  const tileW = (lanesW - GAP) / 2;
  // The lanes start under the floating header (SignInScreen pulls them up),
  // so they get its height back.
  const lanesH = Math.round(Math.min(530, Math.max(360, screenH - 330)));
  const restyleLabel = t("loginStack.aiRestyle", "AI restyle");

  return (
    <View style={styles.root}>
      <KeepDarkScope>
        <MaskedView
          style={{ width: lanesW, height: lanesH, marginHorizontal: SIDE - 24 }}
          maskElement={
            <LinearGradient
              colors={["#000", "#000", "transparent"]}
              locations={[0, 0.58, 0.92]}
              style={StyleSheet.absoluteFill}
            />
          }
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.lanes, { height: lanesH }]}>
            <Lane clips={LANE_A} tileW={tileW} height={lanesH} still={still} restyleLabel={restyleLabel} line={line} />
            <Lane clips={LANE_B} down tileW={tileW} height={lanesH} still={still} restyleLabel={restyleLabel} line={line} />
          </View>
        </MaskedView>
      </KeepDarkScope>
      {/* The faint shade behind the logo, top-left only; Explore carries its
          own glass. Near-black, not black: System Light keeps pure-black
          scrims but turns this into a white haze. */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(4,4,4,0.32)", "rgba(4,4,4,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 0.75 }}
        style={styles.corner}
      />
      <Text style={[styles.headline, { color: "#FFFFFF" }]} accessibilityRole="header">
        {t("loginStack.headlineTop", "You will own everything")}
        {"\n"}
        <Text style={{ color: accent }}>{t("loginStack.headlineAccent", "and be happy.")}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "stretch" },
  corner: { position: "absolute", left: -24, top: 0, width: 220, height: 170 },
  lanes: { flexDirection: "row", gap: GAP, overflow: "hidden" },
  tile: { borderRadius: 18, borderWidth: 1, overflow: "hidden", backgroundColor: "#111" },
  ai: {
    position: "absolute",
    left: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  aiText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  headline: { marginTop: -64, textAlign: "left", fontSize: 30, lineHeight: 32, fontWeight: "900", letterSpacing: -0.6 },
});
