import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { VideoView, useVideoPlayer } from "expo-video";
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
        // Android SurfaceView bypasses the mask and paints over the headline.
        surfaceType="textureView"
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
function Lane({ clips, down, tileW, height, still, line }: {
  clips: ClipName[];
  down?: boolean;
  tileW: number;
  height: number;
  still: boolean;
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
        </View>
      ))}
    </Animated.View>
  );
}

export default function LoginShortsStack({ viewportHeight, reservedHeight = 360, fill = false }: { viewportHeight?: number; reservedHeight?: number; fill?: boolean }) {
  const { t } = useTranslation();
  const { theme, isLight, colors } = useAppTheme();
  const plain = theme === "system" || theme === "minimal";
  const still = !!useReducedMotion();
  const [lanes] = useState(() => loginClipLanes(Object.keys(CLIPS) as ClipName[]));
  const { width, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measuredLanesHeight, setMeasuredLanesHeight] = useState(160);

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
  const lanesH = fill ? measuredLanesHeight : Math.round(Math.max(160, availableHeight - reservedHeight));

  return (
    <View style={[styles.root, fill && { flex: 1 }]}>
      <KeepDarkScope>
        <MaskedView
          style={[{ width: lanesW, marginHorizontal: SIDE - 24 }, fill ? { flex: 1, minHeight: 160 } : { height: lanesH }]}
          onLayout={fill ? (event) => setMeasuredLanesHeight(Math.round(event.nativeEvent.layout.height)) : undefined}
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
            {columns.map((clips, index) => <Lane key={index} clips={clips} down={index % 2 === 1} tileW={tileW} height={lanesH} still={still} line={line} />)}
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
