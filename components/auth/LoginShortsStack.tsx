import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { VideoView, useVideoPlayer } from "expo-video";
import { shareAudioWhenSilent } from "../../libs/videoAudioMixing";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { useSilenceOnRelease } from "../../hooks/useSilenceOnRelease";
import { useReducedMotion } from "react-native-reanimated";
import { KeepDarkScope } from "../../libs/jsx/tone";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loginClipLanes } from "../../libs/login-clip-lanes";
import { LOGIN_CLIPS as CLIPS } from "./login-clip-assets";

/**
 * The top half of the sign-in screen: two phone lanes, or three on wider screens, drifting past
 * in opposite directions, then the headline. Shares the selected clip
 * catalogue and shuffled lane order with the web drawer.
 *
 * The clips ship with the app (sources in assets/login-stack/SOURCES.txt),
 * so the sign-in screen never waits on the
 * network and can never show a feed post.
 *
 * Colours: the tiles sit in KeepDarkScope and are written in their final
 * colours; the headline is written dark (white) and System Light flips it to
 * ink like every other screen.
 */
type ClipName = keyof typeof CLIPS;

const GAP = 8;
const SIDE = 10;
/** One trip through a lane's four clips, as on web. */
const LOOP_MS = 32000;

/**
 * Mounted only once its tile has come into view, so opening the screen builds
 * no players at all and the first few start a frame later. Fades in on its
 * first decoded frame instead of popping in over the empty tile.
 */
function Clip({ name, playing }: { name: ClipName; playing: boolean }) {
  const player = useVideoPlayer(CLIPS[name].video, (p) => {
    shareAudioWhenSilent(p);
    p.muted = true;
    p.loop = true;
  });
  useSilenceOnRelease(player);
  const opacity = useRef(new Animated.Value(0)).current;
  const fadeIn = () => Animated.timing(opacity, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image source={CLIPS[name].poster} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <VideoView
        onFirstFrameRender={fadeIn}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Android SurfaceView bypasses the mask and paints over the headline.
        surfaceType="textureView"
        nativeControls={false}
        allowsPictureInPicture={false}
        fullscreenOptions={{ enable: false }}
      />
    </Animated.View>
  );
}

/** Reduced motion: the still frame only, no player. */
function Still({ name }: { name: ClipName }) {
  return <Image source={CLIPS[name].poster} style={StyleSheet.absoluteFill} resizeMode="cover" />;
}

/**
 * A lane is its four clips plus the first two again, so the jump from the end
 * back to the start lands on the same picture. Only tiles inside the window
 * play, so at most three decode per lane.
 */
function Lane({ clips, down, tileW, height, still, line, armed }: {
  clips: ClipName[];
  down?: boolean;
  tileW: number;
  height: number;
  still: boolean;
  line: string;
  armed: boolean;
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
  // Tiles that have been on screen keep their player, so a clip drifting back
  // in does not reload; tiles never seen never build one.
  const [seen, setSeen] = useState<boolean[]>(() => visibleAt(0));
  useEffect(() => {
    setSeen((prev) => (visible.some((v, i) => v && !prev[i]) ? prev.map((p, i) => p || visible[i]) : prev));
  }, [visible]);

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
          {armed && seen[i] ? (still ? <Still name={name} /> : <Clip name={name} playing={visible[i]} />) : null}
        </View>
      ))}
    </Animated.View>
  );
}

export default function LoginShortsStack({ viewportHeight, reservedHeight = 360 }: { viewportHeight?: number; reservedHeight?: number }) {
  const { t } = useTranslation();
  const { theme, isLight, colors } = useAppTheme();
  const plain = theme === "system" || theme === "minimal";
  const still = !!useReducedMotion();
  const [lanes] = useState(() => loginClipLanes(Object.keys(CLIPS) as ClipName[]));
  const { width, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The screen slides up with empty tiles; clips start building the frame
  // after it has drawn, so opening sign-in never waits on video players.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setArmed(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);

  // Headline accent, written dark (System Light inverts the grey to ink).
  const accent = theme === "hazy" ? "#C9A7FF" : plain ? "#FFFFFF" : colors.accent;
  const line = isLight ? "rgba(11,11,13,0.08)" : theme === "osaka" ? "rgba(80,200,255,0.4)" : "rgba(255,255,255,0.10)";

  // The screen pads 24 each side; the lanes sit 10 from the edges.
  const lanesW = width - SIDE * 2;
  const selected = [...lanes.first, ...lanes.second];
  const columns = width >= 768 ? [selected.slice(0, 3), selected.slice(3, 6), selected.slice(6)] : [lanes.first, lanes.second];
  const tileW = (lanesW - GAP * (columns.length - 1)) / columns.length;
  // Native navigation can give the sheet less space than the window reports.
  // Budget against the actual scroll frame, reserving room for the form.
  const availableHeight = viewportHeight ?? screenH - insets.top - insets.bottom;
  const lanesH = Math.floor(Math.max(160, availableHeight - reservedHeight));

  return (
    <View style={styles.root}>
      <KeepDarkScope>
        <MaskedView
          style={{ width: lanesW, marginHorizontal: SIDE - 24, height: lanesH }}
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
            {columns.map((clips, index) => <Lane key={index} clips={clips} down={index % 2 === 1} tileW={tileW} height={lanesH} still={still} line={line} armed={armed} />)}
          </View>
        </MaskedView>
      </KeepDarkScope>
      <View style={styles.headline}>
        <Text style={styles.headlineText} accessibilityRole="header">
          {t("loginStack.headlineTop", "You will own everything")}
        </Text>
        <View style={{ opacity: plain ? 0.6 : 1 }}>
          <Text style={[styles.headlineText, { color: accent }]}>
            {t("loginStack.headlineAccent", "and be happy.")}
          </Text>
        </View>
      </View>
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
  headline: { marginTop: -64 },
  headlineText: { color: "#FFFFFF", textAlign: "center", fontSize: 30, lineHeight: 32, fontWeight: "900", letterSpacing: -0.6 },
});
